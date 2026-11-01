import { existsSync, readFileSync, readdirSync, realpathSync } from 'node:fs';
import { builtinModules, createRequire } from 'node:module';
import { dirname, join, relative, resolve, sep } from 'node:path';
import type { Plugin, ViteDevServer } from 'vite';
import { loadGameConfig } from './project';

const MODULES_ID = 'virtual:blacklight/modules';
const RESOLVED_MODULES_ID = `\0${MODULES_ID}`;

/** Where a module listed in `game.config.ts` comes from. */
export interface ResolvedModule {
  /** Key in `game.config.ts` `modules` and `name` of the definition. */
  name: string;
  /** Import specifier: a package name or an absolute file path. */
  source: string;
  /** Path or package shown in messages and used in generated types. */
  label: string;
  /** `true` for `modules/<name>/<name>.module.ts` in the game. */
  local: boolean;
}

interface Manifest {
  dependencies?: Record<string, string>;
  devDependencies?: Record<string, string>;
}

function readManifest(root: string): Manifest {
  try {
    return JSON.parse(readFileSync(join(root, 'package.json'), 'utf8')) as Manifest;
  } catch {
    return {};
  }
}

/**
 * Package names a module may have, in the order they are looked up: official modules first, then
 * registry modules (`blacklight-module-<name>`, scoped or not).
 */
export function modulePackageCandidates(name: string, installed: string[]): string[] {
  const scoped = installed.filter((dep) => dep.endsWith(`/blacklight-module-${name}`)).sort();
  return [
    `@blacklight/module-${name}`,
    `@blacklight/${name}`,
    `blacklight-module-${name}`,
    ...scoped,
  ];
}

/**
 * Finds each module named in `game.config.ts`: a game-local `modules/<name>/<name>.module.ts`
 * first, then an installed package.
 *
 * @throws Error naming the modules that were not found and how to add them.
 */
export function resolveModules(root: string, names: string[]): ResolvedModule[] {
  const manifest = readManifest(root);
  const installed = Object.keys({ ...manifest.dependencies, ...manifest.devDependencies });
  const missing: string[] = [];
  const found: ResolvedModule[] = [];
  for (const name of names) {
    const local = ['ts', 'js']
      .map((ext) => join(root, 'modules', name, `${name}.module.${ext}`))
      .find((file) => existsSync(file));
    if (local) {
      found.push({
        name,
        source: local,
        label: relative(root, local).split(sep).join('/'),
        local: true,
      });
      continue;
    }
    const pkg = modulePackageCandidates(name, installed).find((candidate) =>
      installed.includes(candidate),
    );
    if (pkg) found.push({ name, source: pkg, label: pkg, local: false });
    else missing.push(name);
  }
  if (missing.length > 0) {
    throw new Error(
      missing
        .map(
          (name) =>
            `game.config.ts lists the module "${name}", which is not installed: run \`blacklight add ${name}\`, or create modules/${name}/${name}.module.ts for a game-local module.`,
        )
        .join('\n'),
    );
  }
  return found;
}

async function moduleNames(root: string): Promise<string[]> {
  const config = await loadGameConfig(root);
  const modules = config.modules;
  return modules && typeof modules === 'object' ? Object.keys(modules) : [];
}

/** Source of `virtual:blacklight/modules`: imports every module and lists its definition. */
export function modulesModule(modules: ResolvedModule[]): string {
  const imports = modules.map((m, i) => `import * as m${i} from ${JSON.stringify(m.source)};`);
  const definitions = modules.map(
    (m, i) => `pickModule(m${i}, ${JSON.stringify(m.name)}, ${JSON.stringify(m.label)})`,
  );
  return `import { pickModule } from '@blacklight/core';
${imports.join('\n')}

export default { dev: import.meta.env.DEV, definitions: [${definitions.join(', ')}] };
`;
}

/**
 * Type declarations that give `game.modules.<name>` and the `modules` entries of
 * `game.config.ts` their types; appended to `.blacklight/types.d.ts`.
 */
export function modulesTypes(root: string, modules: ResolvedModule[]): string {
  if (modules.length === 0) return '';
  const generated = join(root, '.blacklight');
  const spec = (m: ResolvedModule) => {
    if (!m.local) return m.source;
    const path = relative(generated, m.source)
      .split(sep)
      .join('/')
      .replace(/\.[jt]s$/, '');
    return path.startsWith('.') ? path : `./${path}`;
  };
  const line = (m: ResolvedModule, type: string) =>
    `      ${JSON.stringify(m.name)}: import('@blacklight/core').${type}<typeof import(${JSON.stringify(spec(m))}), ${JSON.stringify(m.name)}>;`;
  return `
declare module '@blacklight/core' {
  interface Register {
    modules: {
${modules.map((m) => line(m, 'ModuleApiOf')).join('\n')}
    };
    moduleConfigs: {
${modules.map((m) => line(m, 'ModuleConfigOf')).join('\n')}
    };
  }
}
`;
}

/**
 * {@link modulesTypes} for a game's `modules` configuration, or `''` when its modules cannot be
 * resolved yet.
 */
export function gameModulesTypes(root: string, modules: unknown): string {
  try {
    const names = modules && typeof modules === 'object' ? Object.keys(modules) : [];
    return modulesTypes(root, resolveModules(root, names));
  } catch {
    // The build reports missing modules with a full message; types simply leave them out.
    return '';
  }
}

const NODE_BUILTINS = new Set(builtinModules.filter((name) => !name.startsWith('_')));

/** `true` for `fs`, `node:fs`, `fs/promises`… */
export function isNodeBuiltin(source: string): boolean {
  if (source.startsWith('node:')) return true;
  return NODE_BUILTINS.has(source) || NODE_BUILTINS.has(source.split('/')[0]!);
}

/** Packages that only run in Node: native addons and their loaders. */
const NATIVE_LOADERS = ['bindings', 'node-gyp-build', 'node-addon-api', 'prebuild-install', 'nan'];

function packageRoot(name: string, importer: string): string | undefined {
  try {
    const require = createRequire(importer);
    let dir = dirname(require.resolve(name));
    while (dir !== dirname(dir)) {
      const file = join(dir, 'package.json');
      if (existsSync(file)) {
        const pkg = JSON.parse(readFileSync(file, 'utf8')) as { name?: string };
        if (pkg.name === name) return dir;
      }
      dir = dirname(dir);
    }
  } catch {
    // ESM-only packages without a "require" condition: look the folder up by name.
    let dir = dirname(importer);
    while (dir !== dirname(dir)) {
      const candidate = join(dir, 'node_modules', name);
      if (existsSync(join(candidate, 'package.json'))) return candidate;
      dir = dirname(dir);
    }
  }
  return undefined;
}

const nodeOnly = new Map<string, boolean>();

/** `true` when the package `name` (resolved from `importer`) is a Node native addon. */
export function isNodeOnlyPackage(name: string, importer: string): boolean {
  const dir = packageRoot(name, importer);
  if (!dir) return false;
  const known = nodeOnly.get(dir);
  if (known !== undefined) return known;
  const pkg = JSON.parse(readFileSync(join(dir, 'package.json'), 'utf8')) as {
    gypfile?: boolean;
    dependencies?: Record<string, string>;
    blacklight?: { nodeOnly?: boolean };
  };
  const result =
    pkg.gypfile === true ||
    pkg.blacklight?.nodeOnly === true ||
    existsSync(join(dir, 'binding.gyp')) ||
    NATIVE_LOADERS.some((loader) => loader in (pkg.dependencies ?? {}));
  nodeOnly.set(dir, result);
  return result;
}

function packageName(source: string): string {
  const parts = source.split('/');
  return source.startsWith('@') ? parts.slice(0, 2).join('/') : parts[0]!;
}

/**
 * Explains why game code cannot import a Node module (MOD-04) and where that code belongs.
 */
export function nodeImportError(source: string, importer: string, root: string): string {
  const file = relative(root, importer).split(sep).join('/');
  return (
    `${file} imports "${source}", which only runs in Node.js. Game code runs in a browser, ` +
    `a WebView or the Electron renderer, where Node modules do not exist. Move this code to the ` +
    `native part of a module (defineNative from @blacklight/native, called with ` +
    `platform.invoke; see "Native parts" in the modules guide) or use a browser package instead.`
  );
}

/**
 * Browser dependencies that module packages import, as Vite `optimizeDeps.include` entries
 * (`<module> > <import>`). Linked modules (`create --link`, workspaces) are served as source, so
 * Vite would only discover their CommonJS imports (sql.js) on first use and reload the page.
 */
export function moduleDependencies(root: string, modules: ResolvedModule[]): string[] {
  const include = new Set<string>();
  for (const module of modules) {
    if (module.local) continue;
    const dir = packageRoot(module.source, join(root, 'package.json'));
    if (!dir) continue;
    const pkg = JSON.parse(readFileSync(join(dir, 'package.json'), 'utf8')) as {
      dependencies?: Record<string, string>;
    };
    const deps = Object.keys(pkg.dependencies ?? {}).filter(
      (dep) => !isNodeOnlyPackage(dep, join(dir, 'package.json')),
    );
    if (deps.length === 0) continue;
    const dist = join(dir, 'dist');
    const files = existsSync(dist) ? readdirSync(dist).filter((f) => f.endsWith('.js')) : [];
    for (const file of files) {
      const code = readFileSync(join(dist, file), 'utf8');
      for (const match of code.matchAll(/(?:from\s*|import\s*\(\s*)["']([^"'.][^"']*)["']/g)) {
        const spec = match[1]!;
        if (deps.some((dep) => spec === dep || spec.startsWith(`${dep}/`))) {
          include.add(`${module.source} > ${spec}`);
        }
      }
    }
  }
  return [...include].sort();
}

/**
 * The OS's own spelling of `path` (`realpathSync.native`: symlinks and Windows 8.3 short names
 * expanded); a path that no longer exists is returned as written.
 */
function realpath(path: string): string {
  try {
    return realpathSync.native(path);
  } catch {
    return resolve(path);
  }
}

/** {@link realpath}, lower-cased on Windows, whose file system ignores case: for comparisons. */
function pathKey(path: string): string {
  const real = realpath(path);
  return process.platform === 'win32' ? real.toLowerCase() : real;
}

/**
 * Vite plugin for modules: serves `virtual:blacklight/modules` (the modules listed in
 * `game.config.ts`) and stops the build when game code imports a Node module.
 */
export function blacklightModules(options: { root: string }): Plugin {
  // Real paths on both sides: on macOS a game under `/var/folders` (a symlink to
  // `/private/var/folders`), on Windows a short 8.3 name (`C:\Users\RUNNER~1`, what `os.tmpdir()`
  // returns on GitHub's runners) and on any OS a repository reached through a symlink would
  // otherwise compare two spellings of the same directory and never match, which silently lets
  // Node imports through to Vite's browser stubs (MOD-04). Only the native call expands short names.
  const root = realpath(options.root);
  const rootKey = pathKey(root);
  const isGameFile = (file: string | undefined): file is string =>
    !!file &&
    !file.startsWith('\0') &&
    pathKey(file).startsWith(rootKey + sep) &&
    // Vite writes ids with `/` on every OS.
    !/[\\/](node_modules|\.blacklight)[\\/]/.test(file);
  let server: ViteDevServer | undefined;

  return {
    name: 'blacklight:modules',
    // Before Vite's resolver, which would otherwise turn Node built-ins into empty browser stubs.
    enforce: 'pre',
    async config() {
      try {
        const include = moduleDependencies(root, resolveModules(root, await moduleNames(root)));
        return include.length > 0 ? { optimizeDeps: { include } } : undefined;
      } catch {
        // An invalid config or a missing module is reported by the build with a full message.
        return undefined;
      }
    },
    configureServer(dev) {
      server = dev;
      const invalidate = (file: string) => {
        if (!/game\.config\.[jt]s$|[\\/]modules[\\/]/.test(file)) return;
        const module = dev.moduleGraph.getModuleById(RESOLVED_MODULES_ID);
        if (module) dev.moduleGraph.invalidateModule(module);
      };
      dev.watcher.on('add', invalidate);
      dev.watcher.on('unlink', invalidate);
      dev.watcher.on('change', invalidate);
    },
    resolveId(source, importer) {
      if (source === MODULES_ID) return RESOLVED_MODULES_ID;
      if (!isGameFile(importer) || source.startsWith('.') || source.startsWith('/')) return null;
      if (source.startsWith('virtual:') || source.startsWith('@blacklight/')) return null;
      if (isNodeBuiltin(source) || isNodeOnlyPackage(packageName(source), importer)) {
        const message = nodeImportError(source, realpath(importer), root);
        if (server) server.config.logger.error(message);
        this.error(message);
      }
      return null;
    },
    async load(id) {
      if (id !== RESOLVED_MODULES_ID) return undefined;
      return modulesModule(resolveModules(root, await moduleNames(root)));
    },
  };
}
