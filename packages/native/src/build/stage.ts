import {
  cpSync,
  existsSync,
  mkdirSync,
  readFileSync,
  realpathSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import {
  contentSecurityPolicy,
  resolveSecurity,
  type ResolvedGameConfig,
  type ResolvedSecurity,
} from '@blacklight/core/config';
import type { AppManifest } from '../main/manifest';

const require = createRequire(import.meta.url);

/**
 * Folder of an installed package (symlinks resolved), from `@blacklight/native`'s point of view.
 * The desktop targets use it to copy native addons and the engine's main process into the app.
 *
 * @throws Error when the package is not installed.
 *
 * @example
 * ```ts
 * import { packageDir } from '@blacklight/native/build';
 *
 * const sdl = packageDir('@kmamal/sdl'); // the real folder, behind pnpm's symlinks
 * ```
 */
export function packageDir(name: string): string {
  // Some packages do not export ./package.json: walk up from the entry point instead.
  let dir = dirname(realpathSync(require.resolve(name)));
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
  throw new Error(`Cannot find the folder of ${name}; reinstall the game's dependencies.`);
}

/**
 * Version of the Electron runtime the app is packaged with: the `electron` package installed
 * next to `@blacklight/native`.
 *
 * @example
 * ```ts
 * import { electronVersion } from '@blacklight/native/build';
 *
 * console.log(`Packaging with Electron ${electronVersion()}`);
 * ```
 */
export function electronVersion(): string {
  return (require('electron/package.json') as { version: string }).version;
}

/**
 * Path of the local Electron executable, for dev runs and bytecode compilation.
 *
 * @example
 * ```ts
 * import { spawn } from 'node:child_process';
 * import { electronBinary } from '@blacklight/native/build';
 *
 * spawn(electronBinary(), ['.blacklight/desktop/app'], { stdio: 'inherit' });
 * ```
 */
export function electronBinary(): string {
  return require('electron') as string;
}

/**
 * The manifest the main process reads (`blacklight.json`), from the game's validated
 * configuration. Security settings are resolved for `release`; Steam is kept only for the Steam
 * target.
 *
 * @example
 * ```ts
 * import { resolveConfig } from '@blacklight/core/config';
 * import { appManifest } from '@blacklight/native/build';
 *
 * const manifest = appManifest(resolveConfig(config), { release: true, steam: false });
 * ```
 */
export function appManifest(
  config: ResolvedGameConfig,
  options: { release: boolean; steam?: boolean; devServer?: string; natives?: string[] },
): AppManifest {
  const security: ResolvedSecurity = resolveSecurity(
    config.security,
    options.release,
    config.modules,
  );
  return {
    name: config.name,
    id: config.id,
    version: config.version,
    resolution: { width: config.resolution.width, height: config.resolution.height },
    window: config.window ?? {},
    release: options.release,
    security: {
      devtools: security.devtools,
      debugger: security.debugger,
      csp: security.csp ? contentSecurityPolicy(security.csp) : null,
    },
    save: config.save?.location ? { location: config.save.location } : {},
    ...(options.steam && config.steam ? { steam: { appId: config.steam.appId } } : {}),
    ...(config.discord ? { discord: { appId: config.discord.appId } } : {}),
    gameDir: 'game',
    ...(options.devServer ? { devServer: options.devServer } : {}),
    ...(options.natives?.length ? { natives: options.natives } : {}),
  };
}

/** Options of {@link stageApp}. */
export interface StageOptions {
  /** Output folder (emptied first). */
  appDir: string;
  /** Written to `blacklight.json` (see {@link appManifest}). */
  manifest: AppManifest;
  /** Web build to embed; omitted for dev runs against the Vite server. */
  webDist?: string;
  /** Steam target: ship steamworks.js. */
  steam?: boolean;
  /** Ship the SDL binding (only when built for the OS and CPU it was installed for). */
  sdl?: boolean;
  /** Link native modules instead of copying them (dev runs). */
  link?: boolean;
  /** Main-process files of game modules (`defineNative`), copied to `natives/`. */
  natives?: {
    /** Module name, used as the file name in `natives/`. */
    name: string;
    /** Bundled CommonJS file of the module's main-process part. */
    file: string;
  }[];
}

/**
 * Writes the app folder electron-builder packages: `package.json`, `main.cjs` (the engine's main
 * process), `preload.cjs`, `blacklight.json`, the web build in `game/`, and native addons in
 * `native_modules/` (kept out of `node_modules` so electron-builder does not try to rebuild them).
 *
 * @example
 * ```ts
 * import { appManifest, stageApp } from '@blacklight/native/build';
 *
 * stageApp({
 *   appDir: '.blacklight/desktop/app',
 *   manifest: appManifest(resolved, { release: true }),
 *   webDist: 'dist',
 * });
 * ```
 */
export function stageApp(options: StageOptions): void {
  const { appDir, manifest } = options;
  rmSync(appDir, { recursive: true, force: true });
  mkdirSync(appDir, { recursive: true });
  const dist = join(packageDir('@blacklight/native'), 'dist');
  cpSync(join(dist, 'main', 'index.cjs'), join(appDir, 'blacklight-main.cjs'));
  cpSync(join(dist, 'preload.cjs'), join(appDir, 'preload.cjs'));
  writeFileSync(
    join(appDir, 'main.cjs'),
    "// Generated by the blacklight CLI.\nrequire('./blacklight-main.cjs').startApp({ appDir: __dirname });\n",
  );
  writeFileSync(
    join(appDir, 'package.json'),
    `${JSON.stringify(
      {
        name: manifest.id.replace(/[^a-z0-9-]/g, '-'),
        productName: manifest.name,
        version: manifest.version,
        description: manifest.name,
        main: 'main.cjs',
        private: true,
        // Window class on Linux, so desktops link the window to the installed .desktop entry.
        desktopName: `${manifest.id}.desktop`,
        homepage: `https://${manifest.id.split('.').slice(0, 2).reverse().join('.')}`,
        author: { name: manifest.name },
      },
      null,
      2,
    )}\n`,
  );
  const natives: string[] = [];
  for (const native of options.natives ?? []) {
    const target = join('natives', `${native.name}.cjs`);
    mkdirSync(join(appDir, 'natives'), { recursive: true });
    cpSync(native.file, join(appDir, target));
    natives.push(target);
  }
  const final = natives.length ? { ...manifest, natives } : manifest;
  writeFileSync(join(appDir, 'blacklight.json'), `${JSON.stringify(final, null, 2)}\n`);
  if (options.webDist) cpSync(options.webDist, join(appDir, 'game'), { recursive: true });
  const modules = [
    ...(options.sdl !== false ? ['@kmamal/sdl'] : []),
    ...(options.steam ? ['steamworks.js'] : []),
  ];
  for (const name of modules) {
    const from = packageDir(name);
    const to = join(appDir, 'native_modules', name);
    mkdirSync(dirname(to), { recursive: true });
    if (options.link) symlinkSync(from, to, 'junction');
    else
      cpSync(from, to, {
        recursive: true,
        dereference: true,
        filter: (src) =>
          !/[/\\](node_modules|scripts|src[/\\]native)([/\\]|$)/.test(src.slice(from.length)),
      });
  }
}

/**
 * `true` when a staged app exists with a web build, so a dev run can reuse it.
 *
 * @example
 * ```ts
 * import { isStaged, stageApp } from '@blacklight/native/build';
 *
 * if (!isStaged(appDir)) stageApp({ appDir, manifest, webDist: 'dist' });
 * ```
 */
export function isStaged(appDir: string): boolean {
  return (
    existsSync(join(appDir, 'blacklight.json')) && existsSync(join(appDir, 'game', 'index.html'))
  );
}
