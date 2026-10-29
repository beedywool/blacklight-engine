import { spawnSync } from 'node:child_process';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import {
  moduleNameOf,
  suggestNames,
  validatePackage,
  type IndexEntry,
  type ModuleDetail,
  type ModuleManifest,
  type ModuleSummary,
  type PackageJson,
  type RegistryIndex,
} from '@blacklight/registry';
import type { CAC } from 'cac';
import semver from 'semver';
import { generateTypes } from '../vite';

/** Registry used when neither `--registry` nor `BLACKLIGHT_REGISTRY` is set. */
export const DEFAULT_REGISTRY = 'https://registry.blacklight.beedywool.com';

/** Modules maintained with the engine: `blacklight add` knows them even without the registry. */
export const OFFICIAL_MODULES: Record<string, { dependencies: string[] }> = {
  http: { dependencies: [] },
  sqlite: { dependencies: [] },
  'cloud-save': { dependencies: ['http'] },
  'accounts-oidc': { dependencies: ['http'] },
  achievements: { dependencies: ['http'] },
  telemetry: { dependencies: [] },
};

const CONFIG_FILES = ['game.config.ts', 'game.config.js'];

/** Options shared by the registry commands; `fetch` and `log` are replaceable for tests. */
export interface RegistryOptions {
  /** Registry base URL. @defaultValue `BLACKLIGHT_REGISTRY`, else {@link DEFAULT_REGISTRY} */
  registry?: string;
  fetch?: typeof fetch;
  log?: (line: string) => void;
}

/** The registry URL from the option, the environment or the default, without a trailing slash. */
export function registryUrl(option?: string): string {
  return (option || process.env.BLACKLIGHT_REGISTRY || DEFAULT_REGISTRY).replace(/\/+$/, '');
}

class RegistryUnreachable extends Error {}

async function getJson<T>(
  url: string,
  get: typeof fetch,
): Promise<{ status: number; data: T | undefined }> {
  let response: Response;
  try {
    response = await get(url, { headers: { accept: 'application/json' } });
  } catch (error) {
    throw new RegistryUnreachable(
      `Cannot reach the module registry (${url}): ${(error as Error).message}. Check your connection, or set --registry / BLACKLIGHT_REGISTRY.`,
    );
  }
  if (response.status === 404) return { status: 404, data: undefined };
  if (!response.ok) {
    throw new RegistryUnreachable(
      `The module registry answered HTTP ${response.status} for ${url}.`,
    );
  }
  return { status: response.status, data: (await response.json()) as T };
}

function readJson<T>(file: string): T | undefined {
  try {
    return JSON.parse(readFileSync(file, 'utf8')) as T;
  } catch {
    return undefined;
  }
}

/** A module to install, with what `add` learned about it. */
export interface PlannedModule {
  name: string;
  package: string;
  /** What the package manager receives: `pkg@1.2.0`, `pkg`, or `link:<path>`. */
  spec: string;
  manifest?: Pick<ModuleManifest, 'engine' | 'platforms' | 'permissions' | 'dependencies'>;
  version?: string;
}

/** Options of {@link addModule}. */
export interface AddOptions extends RegistryOptions {
  /** Game folder (holds `game.config.ts`). */
  root: string;
  name: string;
  /** Run the package manager. @defaultValue `true` */
  install?: boolean;
  /** Install even when the module declares another engine version. */
  force?: boolean;
  /** Runs a command; replaceable for tests. */
  run?: (command: string, args: string[], cwd: string) => void;
}

/** What {@link addModule} did. */
export interface AddResult {
  /** Installed modules, dependencies first. */
  modules: PlannedModule[];
  /** Modules added to `game.config.ts` (already listed ones are left alone). */
  configured: string[];
  /** Package manager command, when one ran. */
  command?: string[];
}

/** Folder of the engine checkout when the game links `@blacklight/core` from it (`--link`). */
export function linkedCheckout(root: string): string | undefined {
  const manifest = readJson<PackageJson>(join(root, 'package.json'));
  const deps = {
    ...(manifest?.dependencies as Record<string, string> | undefined),
    ...(manifest?.devDependencies as Record<string, string> | undefined),
  };
  const core = deps['@blacklight/core'];
  const match = core && /^link:(.*)[\\/]packages[\\/]core[\\/]?$/.exec(core);
  return match ? resolve(root, match[1]!) : undefined;
}

/** Package manager of a game, from its lock file. */
export function packageManager(root: string): { command: string; add: string[] } {
  if (existsSync(join(root, 'pnpm-lock.yaml'))) return { command: 'pnpm', add: ['add'] };
  if (existsSync(join(root, 'yarn.lock'))) return { command: 'yarn', add: ['add'] };
  if (existsSync(join(root, 'bun.lock')) || existsSync(join(root, 'bun.lockb')))
    return { command: 'bun', add: ['add'] };
  return { command: 'npm', add: ['install'] };
}

function defaultRun(command: string, args: string[], cwd: string): void {
  const result = spawnSync(command, args, {
    cwd,
    stdio: 'inherit',
    shell: process.platform === 'win32',
  });
  if (result.status !== 0) {
    throw new Error(
      `\`${command} ${args.join(' ')}\` failed in ${cwd}; fix the error above and run it again.`,
    );
  }
}

async function lookup(name: string, options: AddOptions, root: string): Promise<PlannedModule> {
  const registry = registryUrl(options.registry);
  const get = options.fetch ?? fetch;
  const checkout = linkedCheckout(root);
  let detail: ModuleDetail | undefined;
  try {
    const { data } = await getJson<ModuleDetail>(
      `${registry}/v1/modules/${encodeURIComponent(name)}.json`,
      get,
    );
    detail = data;
    if (!detail) {
      const { data: index } = await getJson<RegistryIndex>(`${registry}/v1/index.json`, get).catch(
        () => ({ data: undefined }),
      );
      const close = suggestNames(
        name,
        new Set([...(index?.modules.map((m) => m.name) ?? []), ...Object.keys(OFFICIAL_MODULES)]),
      );
      throw new Error(
        `There is no module named "${name}" in the registry.${close.length ? ` Did you mean ${close.map((c) => `"${c}"`).join(' or ')}?` : ''} Run \`blacklight search\` to list modules.`,
      );
    }
  } catch (error) {
    if (!(error instanceof RegistryUnreachable) || !OFFICIAL_MODULES[name]) throw error;
    options.log?.(`${error.message}\nUsing the built-in entry of the official "${name}" module.`);
  }

  const packageName = detail?.package ?? `@blacklight/module-${name}`;
  // A game made with `create-blacklight --link` uses the checkout's modules too.
  if (checkout) {
    const folder = join(checkout, 'packages', 'modules', name);
    const local = readJson<PackageJson>(join(folder, 'package.json'));
    if (local?.name === packageName) {
      const manifest = local.blacklight as ModuleManifest | undefined;
      const { command } = packageManager(root);
      return {
        name,
        package: packageName,
        spec: `${command === 'npm' ? 'file' : 'link'}:${folder}`,
        manifest,
        version: local.version,
      };
    }
  }
  if (detail) {
    return {
      name,
      package: packageName,
      spec: `${packageName}@${detail.version}`,
      manifest: detail,
      version: detail.version,
    };
  }
  return {
    name,
    package: packageName,
    spec: packageName,
    manifest: undefined,
  };
}

function checkEngine(module: PlannedModule, root: string, options: AddOptions): void {
  const engine = module.manifest?.engine;
  if (!engine) return;
  const core = readJson<PackageJson>(
    join(root, 'node_modules', '@blacklight', 'core', 'package.json'),
  );
  if (!core?.version) {
    options.log?.(
      `@blacklight/core is not installed yet: engine compatibility of "${module.name}" (${engine}) not checked.`,
    );
    return;
  }
  if (semver.satisfies(core.version, engine, { includePrerelease: true })) return;
  const message = `The "${module.name}" module ${module.version ?? ''} supports @blacklight/core ${engine}, but this game uses ${core.version}.`;
  if (!options.force) {
    throw new Error(
      `${message} Upgrade the engine, pick another module version, or pass --force to install it anyway.`,
    );
  }
  options.log?.(`${message} Installing anyway (--force).`);
}

function configFile(root: string): string {
  const file = CONFIG_FILES.map((f) => join(root, f)).find((f) => existsSync(f));
  if (!file) {
    throw new Error(
      `No game.config.ts in ${root}. Run the command from your game's folder, or create a game with \`pnpm create blacklight\`.`,
    );
  }
  return file;
}

/** Index of the brace closing the one at `open`, skipping strings and comments. */
function closingBrace(source: string, open: number): number | undefined {
  let depth = 0;
  for (let i = open; i < source.length; i++) {
    const c = source[i]!;
    if (c === '"' || c === "'" || c === '`') {
      for (i++; i < source.length && source[i] !== c; i++) if (source[i] === '\\') i++;
    } else if (c === '/' && source[i + 1] === '/') {
      i = source.indexOf('\n', i);
      if (i < 0) return undefined;
    } else if (c === '/' && source[i + 1] === '*') {
      i = source.indexOf('*/', i);
      if (i < 0) return undefined;
      i++;
    } else if (c === '{') depth++;
    else if (c === '}' && --depth === 0) return i;
  }
  return undefined;
}

/** Inserts `entry` as the last property of the object whose braces are at `open`/`close`. */
function appendProperty(
  source: string,
  open: number,
  close: number,
  entry: string,
  indent: string,
): string {
  const inside = source.slice(open + 1, close);
  if (inside.trim() === '') return `${source.slice(0, open + 1)} ${entry} ${source.slice(close)}`;
  if (!inside.includes('\n')) {
    const body = inside.trimEnd().replace(/,$/, '');
    return `${source.slice(0, open + 1)}${body}, ${entry} ${source.slice(close)}`;
  }
  const before = source.slice(0, close).trimEnd();
  const comma = before.endsWith(',') || before.endsWith('{') ? '' : ',';
  const closingIndent = /\n([ \t]*)$/.exec(source.slice(0, close))?.[1] ?? '';
  return `${before}${comma}\n${indent}${entry},\n${closingIndent}${source.slice(close)}`;
}

/** The key as written in an object literal. */
function propertyKey(name: string): string {
  return /^[A-Za-z_$][\w$]*$/.test(name) ? name : `'${name}'`;
}

/**
 * Adds `<name>: {}` to the `modules` object of a `game.config.ts` source. Returns the new source,
 * the same source when the module is already listed, or `undefined` when the file is too unusual to
 * edit safely.
 *
 * @example
 * ```ts
 * addToConfig("export default defineConfig({\n  name: 'G',\n});\n", 'sqlite');
 * // "export default defineConfig({\n  name: 'G',\n  modules: { sqlite: {} },\n});\n"
 * ```
 */
export function addToConfig(source: string, name: string): string | undefined {
  const entry = `${propertyKey(name)}: {}`;
  const modules = /(^|[\s,{])modules\s*:\s*\{/.exec(source);
  if (modules) {
    const open = modules.index + modules[0].length - 1;
    const close = closingBrace(source, open);
    if (close === undefined) return undefined;
    const inside = source.slice(open + 1, close);
    const escaped = name.replace(/[-]/g, '\\-');
    if (new RegExp(`(^|[\\s,{])(['"]?)${escaped}\\2\\s*:`).test(inside)) return source;
    const lineIndent = /(^|\n)([ \t]*)[^\n]*$/.exec(source.slice(0, modules.index + 1))?.[2] ?? '';
    return appendProperty(source, open, close, entry, `${lineIndent}  `);
  }
  const call = /defineConfig\s*\(\s*\{/.exec(source) ?? /export\s+default\s*\{/.exec(source);
  if (!call) return undefined;
  const open = call.index + call[0].length - 1;
  const close = closingBrace(source, open);
  if (close === undefined) return undefined;
  const indent = /\n([ \t]+)\S/.exec(source.slice(open, close))?.[1] ?? '  ';
  return appendProperty(source, open, close, `modules: { ${entry} }`, indent);
}

function hasDependency(root: string, packageName: string): boolean {
  const manifest = readJson<PackageJson>(join(root, 'package.json'));
  return !!(
    (manifest?.dependencies as Record<string, string> | undefined)?.[packageName] ??
    (manifest?.devDependencies as Record<string, string> | undefined)?.[packageName]
  );
}

/**
 * `blacklight add <name>`: finds the module in the registry, checks engine compatibility, installs
 * it and its module dependencies with the game's package manager, lists them in `game.config.ts`
 * and regenerates the types.
 *
 * @throws Error when the module is unknown, incompatible (without `force`) or the install fails.
 *
 * @example
 * ```ts
 * await addModule({ root: process.cwd(), name: 'sqlite' });
 * ```
 */
export async function addModule(options: AddOptions): Promise<AddResult> {
  const root = resolve(options.root);
  const log = options.log ?? (() => {});
  const file = configFile(root);
  const planned: PlannedModule[] = [];
  const visit = async (name: string, chain: string[]) => {
    if (planned.some((m) => m.name === name) || chain.includes(name)) return;
    const module = await lookup(name, { ...options, log }, root);
    checkEngine(module, root, { ...options, log });
    const dependencies =
      module.manifest?.dependencies ?? OFFICIAL_MODULES[name]?.dependencies ?? [];
    for (const dependency of dependencies) await visit(dependency, [...chain, name]);
    planned.push(module);
  };
  await visit(options.name, []);

  for (const module of planned) {
    const what = module.manifest
      ? `platforms: ${module.manifest.platforms.join(', ')}; permissions: ${module.manifest.permissions.length ? module.manifest.permissions.join(', ') : 'none'}`
      : 'manifest not available offline';
    log(
      `${module.name} (${module.package}${module.version ? ` ${module.version}` : ''}) - ${what}`,
    );
  }

  const result: AddResult = { modules: planned, configured: [] };
  const toInstall = planned.filter(
    (m) => m.name === options.name || !hasDependency(root, m.package),
  );
  if (options.install !== false && toInstall.length > 0) {
    const pm = packageManager(root);
    const args = [
      ...pm.add,
      ...toInstall.map((m) => (m.spec.includes(':') ? `${m.package}@${m.spec}` : m.spec)),
    ];
    result.command = [pm.command, ...args];
    (options.run ?? defaultRun)(pm.command, args, root);
  }

  let source = readFileSync(file, 'utf8');
  for (const module of planned) {
    const next = addToConfig(source, module.name);
    if (next === undefined) {
      log(
        `Could not edit ${file} safely. Add this to defineConfig({ ... }):\n  modules: { ${planned.map((m) => `${propertyKey(m.name)}: {}`).join(', ')} },`,
      );
      return result;
    }
    if (next !== source) result.configured.push(module.name);
    source = next;
  }
  writeFileSync(file, source);
  if (result.configured.length > 0) log(`Added ${result.configured.join(', ')} to ${file}.`);

  try {
    await generateTypes(root);
  } catch (error) {
    log(
      `Warning: types not regenerated: ${error instanceof Error ? error.message : String(error)}`,
    );
  }
  return result;
}

/**
 * `blacklight search [query]`: modules of the registry whose name, description or keywords
 * contain `query` (case-insensitive); every module without a query.
 *
 * @example
 * ```ts
 * const found = await searchModules({ query: 'save' });
 * ```
 */
export async function searchModules(
  options: RegistryOptions & { query?: string },
): Promise<ModuleSummary[]> {
  const registry = registryUrl(options.registry);
  const { data } = await getJson<RegistryIndex>(
    `${registry}/v1/index.json`,
    options.fetch ?? fetch,
  );
  if (!data)
    throw new Error(`${registry} has no v1/index.json: is it a Blacklight module registry?`);
  const query = options.query?.toLowerCase().trim() ?? '';
  return data.modules.filter(
    (m) =>
      !query ||
      [m.name, m.description, ...(m.keywords ?? [])].some((text) =>
        text.toLowerCase().includes(query),
      ),
  );
}

/** Aligned text table of modules: name, version, platforms, description. */
export function formatModules(modules: ModuleSummary[]): string {
  if (modules.length === 0) return 'No module found.';
  const rows = [
    ['NAME', 'VERSION', 'PLATFORMS', 'DESCRIPTION'],
    ...modules.map((m) => [
      m.official ? `${m.name} (official)` : m.name,
      m.version,
      m.platforms.join(','),
      m.description,
    ]),
  ];
  const widths = [0, 1, 2].map((i) => Math.max(...rows.map((r) => r[i]!.length)));
  return rows
    .map((r) =>
      r
        .map((cell, i) => (i < 3 ? cell.padEnd(widths[i]!) : cell))
        .join('  ')
        .trimEnd(),
    )
    .join('\n');
}

function exportTargets(value: unknown, out: string[]): string[] {
  if (typeof value === 'string') out.push(value);
  else if (value && typeof value === 'object')
    for (const inner of Object.values(value)) exportTargets(inner, out);
  return out;
}

/** Options of {@link publishModule}. */
export interface PublishOptions extends RegistryOptions {
  /** Module package folder. */
  dir: string;
  /** Print the command instead of publishing. */
  dryRun?: boolean;
  run?: (command: string, args: string[], cwd: string) => void;
}

/**
 * `blacklight publish`: checks a module package (name, manifest, license, built files), publishes it
 * to npm, and prints the index entry to submit to the registry repository.
 *
 * @throws Error listing every problem of the package.
 *
 * @example
 * ```ts
 * const { entry } = await publishModule({ dir: '.', dryRun: true });
 * ```
 */
export async function publishModule(
  options: PublishOptions,
): Promise<{ entry: IndexEntry; command: string[] }> {
  const dir = resolve(options.dir);
  const log = options.log ?? (() => {});
  const pkg = readJson<PackageJson>(join(dir, 'package.json'));
  if (!pkg)
    throw new Error(
      `No readable package.json in ${dir}. Run the command from your module's folder.`,
    );
  const issues = validatePackage(pkg);
  if (issues.length > 0) {
    throw new Error(
      `${pkg.name ?? dir} cannot be published as a Blacklight module:\n${issues.map((i) => `  - ${i}`).join('\n')}`,
    );
  }
  const targets = exportTargets(pkg.exports ?? pkg.module ?? pkg.main ?? './dist/index.js', []);
  const missing = targets.filter(
    (target) => !target.includes('*') && !existsSync(join(dir, target)),
  );
  if (missing.length > 0) {
    throw new Error(
      `${missing.join(', ')} ${missing.length > 1 ? 'do' : 'does'} not exist: build the module first (for example \`npm run build\`).`,
    );
  }
  const command = ['npm', 'publish', '--access', 'public'];
  if (options.dryRun) {
    log(`Dry run: would run \`${command.join(' ')}\` in ${dir}.`);
  } else {
    (options.run ?? defaultRun)(command[0]!, command.slice(1), dir);
  }
  const name = (pkg.blacklight as ModuleManifest).module;
  const repository = typeof pkg.repository === 'string' ? pkg.repository : pkg.repository?.url;
  const entry: IndexEntry = {
    name,
    package: pkg.name!,
    ...(repository ? { repository: repository.replace(/^git\+/, '').replace(/\.git$/, '') } : {}),
  };
  log(
    `To list ${pkg.name} in the registry (${registryUrl(options.registry)}), open a pull request on the index repository adding entries/${name}.json:\n${JSON.stringify(entry, null, 2)}`,
  );
  return { entry, command };
}

/** add, search, publish (MOD-05). */
export function registerRegistryCommands(cli: CAC): void {
  const print = (line: string) => console.log(line);

  cli
    .command('add <module>', 'Install a module from the registry and list it in game.config.ts')
    .option(
      '--registry <url>',
      `Module registry (default: BLACKLIGHT_REGISTRY or ${DEFAULT_REGISTRY})`,
    )
    .option('--no-install', 'Edit game.config.ts without running the package manager')
    .option('--force', 'Install even when the module declares another engine version')
    .action(
      async (name: string, options: { registry?: string; install?: boolean; force?: boolean }) => {
        await addModule({
          root: process.cwd(),
          name: moduleNameOf(name) ?? name,
          registry: options.registry,
          install: options.install,
          force: options.force,
          log: print,
        });
      },
    );

  cli
    .command('search [query]', 'Search the module registry')
    .option('--registry <url>', 'Module registry')
    .option('--json', 'Print JSON')
    .action(async (query: string | undefined, options: { registry?: string; json?: boolean }) => {
      const found = await searchModules({ query, registry: options.registry });
      print(options.json ? JSON.stringify(found, null, 2) : formatModules(found));
    });

  cli
    .command('publish [dir]', 'Check a module package, publish it to npm and print its index entry')
    .option('--dry-run', 'Check and print the commands without publishing')
    .option('--registry <url>', 'Module registry')
    .action(async (dir: string | undefined, options: { dryRun?: boolean; registry?: string }) => {
      await publishModule({
        dir: dir ?? '.',
        dryRun: options.dryRun,
        registry: options.registry,
        log: print,
      });
    });
}
