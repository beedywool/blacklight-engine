// Native parts of modules (MOD-03) for desktop builds: each configured module's `native` entry is
// bundled into one CommonJS file for the Electron main process; Node addons it imports stay
// separate and ship in the app's native_modules/.

import { cpSync, existsSync, mkdirSync, readFileSync, realpathSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { build, type Plugin } from 'vite';
import { isNodeOnlyPackage, resolveModules } from '../modules';

/** A bundled native part. */
export interface NativeBundle {
  name: string;
  file: string;
}

/** Entry of a module's native part: `modules/<name>/native.ts` or the package's `./native` export. */
export function nativeEntry(
  root: string,
  module: { name: string; source: string; local: boolean },
): string | undefined {
  if (module.local) {
    return ['ts', 'js']
      .map((ext) => join(dirname(module.source), `native.${ext}`))
      .find((file) => existsSync(file));
  }
  try {
    return createRequire(join(root, 'package.json')).resolve(`${module.source}/native`);
  } catch {
    return undefined;
  }
}

function packageName(source: string): string {
  const parts = source.split('/');
  return source.startsWith('@') ? parts.slice(0, 2).join('/') : parts[0]!;
}

/** Folder of a package as seen from `importer`. */
function packageFolder(name: string, importer: string): string | undefined {
  let dir: string;
  try {
    dir = dirname(realpathSync(createRequire(importer).resolve(name)));
  } catch {
    return undefined;
  }
  while (dirname(dir) !== dir) {
    const manifest = join(dir, 'package.json');
    if (
      existsSync(manifest) &&
      (JSON.parse(readFileSync(manifest, 'utf8')) as { name?: string }).name === name
    ) {
      return dir;
    }
    dir = dirname(dir);
  }
  return undefined;
}

/**
 * Copies a Node addon and its runtime dependencies (`bindings`, `file-uri-to-path`…) into `target`
 * (the app's native_modules/), flat, the way Node resolves them through NODE_PATH.
 */
export function copyAddon(
  name: string,
  importer: string,
  target: string,
  seen = new Set<string>(),
): void {
  if (seen.has(name)) return;
  seen.add(name);
  const dir = packageFolder(name, importer);
  if (!dir)
    throw new Error(
      `The native addon "${name}" is not installed; reinstall the game's dependencies.`,
    );
  const to = join(target, name);
  mkdirSync(dirname(to), { recursive: true });
  cpSync(dir, to, {
    recursive: true,
    dereference: true,
    filter: (src) => !/[/\\](node_modules|src|deps|test)([/\\]|$)/.test(src.slice(dir.length)),
  });
  const manifest = JSON.parse(readFileSync(join(dir, 'package.json'), 'utf8')) as {
    dependencies?: Record<string, string>;
  };
  for (const dep of Object.keys(manifest.dependencies ?? {})) {
    // Install-time helpers are not needed once the binary is built.
    if (['prebuild-install', 'node-gyp', 'node-addon-api', 'nan'].includes(dep)) continue;
    copyAddon(dep, join(dir, 'package.json'), target, seen);
  }
}

/**
 * Bundles the native part of every module in `modules` (game.config.ts) to `outDir/<name>.cjs`.
 *
 * @returns The bundles and the Node addons they import (to copy next to the app).
 */
export async function bundleNatives(
  root: string,
  names: string[],
  outDir: string,
): Promise<{ bundles: NativeBundle[]; addons: { name: string; importer: string }[] }> {
  const bundles: NativeBundle[] = [];
  const addons = new Map<string, string>();
  for (const module of names.length > 0 ? resolveModules(root, names) : []) {
    const entry = nativeEntry(root, module);
    if (!entry) continue;
    const externals: Plugin = {
      name: 'blacklight:native-externals',
      enforce: 'pre',
      resolveId(source, importer) {
        if (source === 'electron') return { id: source, external: true };
        if (
          !importer ||
          source.startsWith('.') ||
          source.startsWith('/') ||
          source.startsWith('\0')
        ) {
          return undefined;
        }
        const name = packageName(source);
        if (isNodeOnlyPackage(name, importer)) {
          addons.set(name, importer);
          return { id: source, external: true };
        }
        return undefined;
      },
    };
    await build({
      configFile: false,
      root,
      logLevel: 'warn',
      plugins: [externals],
      ssr: { noExternal: true, target: 'node' },
      build: {
        ssr: entry,
        outDir,
        emptyOutDir: false,
        target: 'node22',
        minify: false,
        rollupOptions: { output: { format: 'cjs', entryFileNames: `${module.name}.cjs` } },
      },
    });
    bundles.push({ name: module.name, file: join(outDir, `${module.name}.cjs`) });
  }
  return { bundles, addons: [...addons].map(([name, importer]) => ({ name, importer })) };
}
