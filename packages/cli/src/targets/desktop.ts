// Desktop targets (PF-03, PF-05): win, mac, linux and steam. The web build runs in Electron with the
// desktop plugin added; @blacklight/native stages and packages the app.

import { cpSync, existsSync, mkdirSync, rmSync } from 'node:fs';
import { createRequire } from 'node:module';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import type { ResolvedGameConfig, ResolvedSecurity } from '@blacklight/core/config';
import type * as CoreConfig from '@blacklight/core/config';
import type * as NativeBuild from '@blacklight/native/build';
import { build, type InlineConfig, type Plugin } from 'vite';
import { loadGameConfig } from '../project';
import { createViteConfig, type ViteConfigOptions } from '../vite';
import { bundleNatives, copyAddon } from './natives';
import type { TargetBuilder, TargetOptions } from './index';

export type DesktopOs = 'win' | 'mac' | 'linux';
type Native = typeof NativeBuild;

/** OS of this machine, in target names. */
export function hostOs(platform: NodeJS.Platform = process.platform): DesktopOs {
  return platform === 'win32' ? 'win' : platform === 'darwin' ? 'mac' : 'linux';
}

function gameRequire(root: string): NodeJS.Require {
  return createRequire(join(root, 'package.json'));
}

/**
 * Loads `@blacklight/native` from the game (desktop games depend on it: the game side of Steam,
 * Discord and gamepad extras lives there too).
 *
 * @throws Error with the install command when the game does not have it.
 */
export async function loadNative(root: string): Promise<{ build: Native; index: string }> {
  const require = gameRequire(root);
  let buildPath: string;
  try {
    buildPath = require.resolve('@blacklight/native/build');
  } catch {
    throw new Error(
      `Desktop targets need @blacklight/native in the game: run \`pnpm add @blacklight/native\` in ${root}, then build again.`,
    );
  }
  const index = require.resolve('@blacklight/native');
  return { build: (await import(pathToFileURL(buildPath).href)) as Native, index };
}

async function loadSecurity(
  root: string,
  release: boolean,
  config: ResolvedGameConfig,
): Promise<ResolvedSecurity> {
  const core = (await import(
    pathToFileURL(gameRequire(root).resolve('@blacklight/core/config')).href
  )) as typeof CoreConfig;
  return core.resolveSecurity(config.security, release);
}

/**
 * Vite plugin that adds the desktop plugin (`desktop()` from @blacklight/native) to the generated
 * entry: the platform, SDL gamepads and tamper reports exist only in desktop builds.
 */
export function desktopEntry(nativeIndex: string): Plugin {
  return {
    name: 'blacklight:desktop-entry',
    enforce: 'pre',
    transform(code, id) {
      if (!id.split('?')[0]!.replace(/\\/g, '/').endsWith('/.blacklight/main.ts')) return undefined;
      const patched = code.replace('const plugins = [', 'const plugins = [__blacklightDesktop(), ');
      if (patched === code) {
        throw new Error(
          'The generated .blacklight/main.ts has no plugin list: update @blacklight/cli.',
        );
      }
      return {
        code: `import { desktop as __blacklightDesktop } from ${JSON.stringify(nativeIndex.replace(/\\/g, '/'))};\n${patched}`,
        map: null,
      };
    },
  };
}

/** Vite configuration of the page of a desktop build (or of `blacklight desktop` in dev). */
export function desktopViteConfig(
  root: string,
  nativeIndex: string,
  outDir: string,
  options: ViteConfigOptions = {},
): InlineConfig {
  const config = createViteConfig(root, options);
  return {
    ...config,
    plugins: [...(config.plugins ?? []), desktopEntry(nativeIndex)],
    build: { ...config.build, outDir, emptyOutDir: true },
  };
}

/** Steps of a desktop build, exposed for tests and for `blacklight run`. */
export interface DesktopBuild {
  /** Staged app folders by architecture. */
  apps: Record<string, string>;
  /** Packages written (empty in dry-run). */
  artifacts: string[];
  /** What was skipped and why (bytecode or SDL for another machine). */
  warnings: string[];
}

const ARCHES: Record<DesktopOs, string[]> = { win: ['x64'], mac: ['x64', 'arm64'], linux: ['x64'] };

/**
 * Architectures a desktop build packages: `--arch` when given; for Steam one app per depot, which
 * on macOS is `universal` (x64 + arm64 in one `.app`) and elsewhere the machine's own; otherwise
 * every shipped one, each in its own package.
 */
export function desktopArches(
  os: DesktopOs,
  options: { arch?: string; steam?: boolean } = {},
  hostArch: string = process.arch,
): string[] {
  if (options.arch) return [options.arch];
  if (options.steam) return os === 'mac' ? ['universal'] : [hostArch];
  return ARCHES[os];
}

/**
 * Builds a desktop target: web build with the desktop plugin, staged app (main process, preload,
 * manifest, native addons), V8 bytecode of the main process, then electron-builder packages with
 * fuses and, when certificates are present, signatures.
 *
 * Flags: `--dir` (unpacked app only, fast), `--arch x64|arm64`, `--no-sign`, `--dry-run` (stage and
 * print the signing plan without packaging).
 */
export async function buildDesktop(
  os: DesktopOs,
  options: TargetOptions & { steam?: boolean },
): Promise<DesktopBuild> {
  const root = resolve(options.root);
  const native = await loadNative(root);
  const target = options.steam ? 'steam' : os;
  const out = join(root, 'release', target);
  const web = join(out, 'web');
  const result: DesktopBuild = { apps: {}, artifacts: [], warnings: [] };

  // Loading game.config.ts runs Vite in dev mode, which sets NODE_ENV: the page must be built as
  // production (import.meta.env.PROD, no debug overlay) whatever ran before.
  process.env.NODE_ENV = 'production';
  await build(desktopViteConfig(root, native.index, web));
  const config = (await loadGameConfig(root)) as unknown as ResolvedGameConfig;
  const security = await loadSecurity(root, true, config);
  if (options.steam && !config.steam) {
    throw new Error(
      "The steam target needs `steam: { appId }` in game.config.ts (480 is Valve's test app).",
    );
  }

  const flags = options.flags as { dir?: boolean; arch?: string; sign?: boolean };
  const arches = desktopArches(os, { arch: flags.arch, steam: options.steam });
  const sameOs = os === hostOs();
  const manifest = native.build.appManifest(config, { release: true, steam: options.steam });
  const plan = native.build.signingPlan(os);
  console.log(`[blacklight] ${plan.summary}`);

  const natives = await bundleNatives(
    root,
    Object.keys(config.modules ?? {}),
    join(out, 'natives'),
  );
  if (natives.addons.length > 0) {
    result.warnings.push(
      `native addons ${natives.addons.map((a) => a.name).join(', ')} ship as installed: addons built against Node's ABI (not Node-API) must be rebuilt for Electron ${native.build.electronVersion()} (see the desktop guide).`,
    );
  }

  for (const arch of arches) {
    const universal = arch === 'universal';
    if (universal && (os !== 'mac' || process.platform !== 'darwin')) {
      throw new Error(
        'A universal macOS app (x64 + arm64) is built on a Mac with the mac or steam target; pass --arch x64 or --arch arm64 to build one architecture.',
      );
    }
    if (universal && natives.addons.length > 0) {
      result.warnings.push(
        `universal app: native addons ${natives.addons.map((a) => a.name).join(', ')} must be universal binaries (lipo), or the x64 + arm64 merge fails; otherwise build each architecture with --arch.`,
      );
    }
    // Native addons and V8 bytecode match the machine that installed / runs them; a universal app
    // gets both architectures of each (SDL made universal, bytecode compiled per architecture).
    const native_ = sameOs && (universal || arch === process.arch);
    const appDir = join(out, arches.length > 1 ? `app-${arch}` : 'app');
    native.build.stageApp({
      appDir,
      manifest,
      webDist: web,
      steam: options.steam,
      sdl: native_,
      natives: natives.bundles,
    });
    for (const addon of natives.addons)
      copyAddon(addon.name, addon.importer, join(appDir, 'native_modules'));
    if (native_ && universal) await native.build.makeSdlUniversal(appDir);
    if (!native_) {
      result.warnings.push(
        `${os} ${arch}: built on ${hostOs()} ${process.arch}, so SDL gamepads (Gamepad API instead) and V8 bytecode are left out; build on a ${os} ${arch} machine for those.`,
      );
    } else if (security.bytecode) {
      await native.build.compileMainToBytecode(
        appDir,
        universal ? await native.build.universalElectrons() : undefined,
      );
    }
    result.apps[arch] = appDir;
    if (options.dryRun) continue;
    result.artifacts.push(
      ...(await native.build.packageApp({
        os,
        appDir,
        outDir: out,
        id: config.id,
        name: config.name,
        fuses: security.fuses,
        sign: flags.sign !== false,
        unpackedOnly: !!flags.dir || !!options.steam,
        arch: [arch],
        icon: join(root, 'icon.png'),
      })),
    );
  }
  for (const warning of result.warnings) console.warn(`[blacklight] ${warning}`);
  if (options.dryRun) {
    for (const step of plan.steps) console.log(`[dry-run] ${step}`);
  }
  return result;
}

/** Folder electron-builder writes the unpacked app of `os` to. */
export function unpackedDir(out: string, os: DesktopOs, arch: string = process.arch): string {
  if (os === 'win') return join(out, arch === 'x64' ? 'win-unpacked' : `win-${arch}-unpacked`);
  if (os === 'linux')
    return join(out, arch === 'x64' ? 'linux-unpacked' : `linux-${arch}-unpacked`);
  return join(out, arch === 'x64' ? 'mac' : `mac-${arch}`);
}

/**
 * The steam target: an unpacked build for this OS with steamworks.js (on macOS a universal app,
 * x64 + arm64; elsewhere this machine's architecture; `--arch` forces one), staged in
 * `release/steam/app/`, copied to
 * `release/steam/content/<os>/`, and the steamcmd depot scripts in `release/steam/scripts/`.
 * Upload with `blacklight upload --target steam` (`--dry-run` checks without uploading).
 */
export async function buildSteam(options: TargetOptions): Promise<DesktopBuild> {
  const root = resolve(options.root);
  const os = hostOs();
  const result = await buildDesktop(os, { ...options, steam: true });
  const out = join(root, 'release', 'steam');
  const content = join(out, 'content', os);
  rmSync(content, { recursive: true, force: true });
  mkdirSync(content, { recursive: true });
  const [arch] = Object.keys(result.apps);
  // Verbatim: the .app's framework symlinks stay relative, so the depot does not point back into
  // release/steam/.
  if (!options.dryRun)
    cpSync(unpackedDir(out, os, arch), content, { recursive: true, verbatimSymlinks: true });
  const config = (await loadGameConfig(root)) as unknown as ResolvedGameConfig;
  const native = await loadNative(root);
  const script = native.build.writeSteamScripts({
    appId: config.steam!.appId,
    depots: config.steam!.depots,
    steamDir: out,
    oses: (['win', 'mac', 'linux'] as const).filter((o) => existsSync(join(out, 'content', o))),
    description: `${config.name} ${config.version}`,
  });
  console.log(`[blacklight] Steam depot scripts: ${script}`);
  return result;
}

/** Target builders registered in `targets` (index.ts). */
export const desktopTargets: Record<'win' | 'mac' | 'linux' | 'steam', TargetBuilder> = {
  win: async (options) => void (await buildDesktop('win', options)),
  mac: async (options) => void (await buildDesktop('mac', options)),
  linux: async (options) => void (await buildDesktop('linux', options)),
  steam: async (options) => void (await buildSteam(options)),
};
