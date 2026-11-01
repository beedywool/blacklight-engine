import { existsSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { FuseState, FuseV1Options, getCurrentFuseWire } from '@electron/fuses';
import type { Configuration } from 'electron-builder';
import { MAC_ENTITLEMENTS, signingPlan, type DesktopOs } from './sign';
import { electronVersion } from './stage';
import { UNIVERSAL_X64_ARCH_FILES } from './universal';

/**
 * Fuses of release builds (SEC-02): no `ELECTRON_RUN_AS_NODE`, no `NODE_OPTIONS`, no `--inspect`,
 * encrypted cookies, the app loaded only from a validated ASAR, no extra `file://` privileges.
 */
export const RELEASE_FUSES = {
  /** `ELECTRON_RUN_AS_NODE` is ignored: the executable cannot be used as a plain Node.js. */
  runAsNode: false,
  /** Cookies on disk are encrypted with an OS-protected key. */
  enableCookieEncryption: true,
  /** `NODE_OPTIONS` is ignored, so it cannot preload code into the main process. */
  enableNodeOptionsEnvironmentVariable: false,
  /** `--inspect` and similar switches are ignored: no debugger can attach to the main process. */
  enableNodeCliInspectArguments: false,
  /** The ASAR archive is checked against the hash embedded in the executable. */
  enableEmbeddedAsarIntegrityValidation: true,
  /** The app loads only from `app.asar`, never from a loose `app/` folder. */
  onlyLoadAppFromAsar: true,
  /** `file://` pages get no privileges beyond a normal web page. */
  grantFileProtocolExtraPrivileges: false,
} as const;

/** Package formats per OS (PF-03). `dir` is the unpacked app (tests, Steam depots). */
export const DESKTOP_TARGETS: Record<
  DesktopOs,
  {
    /** electron-builder target name (`nsis`, `dmg`, `AppImage`…). */
    target: string;
    /** CPU architectures built for this target. */
    arch: string[];
  }[]
> = {
  win: [
    { target: 'nsis', arch: ['x64'] },
    { target: 'portable', arch: ['x64'] },
  ],
  mac: [
    { target: 'dmg', arch: ['x64', 'arm64'] },
    { target: 'zip', arch: ['x64', 'arm64'] },
  ],
  linux: [
    { target: 'AppImage', arch: ['x64'] },
    { target: 'deb', arch: ['x64'] },
  ],
};

/** Options of {@link packageApp} and {@link builderConfig}. */
export interface PackageOptions {
  /** OS to package for. */
  os: DesktopOs;
  /** Staged app folder (see `stageApp`). */
  appDir: string;
  /** Where installers go. */
  outDir: string;
  /** Game id (reverse domain), used as the app id and the deep-link scheme. */
  id: string;
  /** Display name of the app and its installers. */
  name: string;
  /** Turn the release fuses on. */
  fuses: boolean;
  /** Sign when certificates are configured. @defaultValue `true` */
  sign?: boolean;
  /** Only the unpacked app folder (fast; used by tests and Steam depots). */
  unpackedOnly?: boolean;
  /**
   * Architectures to build (default: those of {@link DESKTOP_TARGETS}). `universal` (macOS, on a
   * Mac) packs x64 and arm64 from the same staged app and merges them into one `.app`.
   */
  arch?: string[];
  /** 512×512 (or larger) PNG used for every icon. */
  icon?: string;
  /** Environment read for signing credentials. @defaultValue `process.env` */
  env?: NodeJS.ProcessEnv;
}

/**
 * electron-builder configuration of a Blacklight game: targets per OS, ASAR with native addons
 * unpacked, release fuses, signing as {@link signingPlan} reports it, and the deep-link scheme.
 *
 * @example
 * ```ts
 * import { builderConfig } from '@blacklight/native/build';
 *
 * const config = builderConfig({
 *   os: 'linux',
 *   appDir: '.blacklight/desktop/app',
 *   outDir: 'release',
 *   id: 'com.studio.game',
 *   name: 'My Game',
 *   fuses: true,
 * });
 * config.linux?.target; // [{ target: 'AppImage', … }, { target: 'deb', … }]
 * ```
 */
export function builderConfig(options: PackageOptions): Configuration {
  const plan = signingPlan(options.os, options.env);
  const sign = (options.sign ?? true) && plan.sign;
  const targets = options.unpackedOnly
    ? [{ target: 'dir', arch: options.arch ?? ['x64'] }]
    : DESKTOP_TARGETS[options.os].map((t) => ({ ...t, arch: options.arch ?? t.arch }));
  const entitlements = join(options.appDir, '..', 'entitlements.mac.plist');
  if (options.os === 'mac') writeFileSync(entitlements, MAC_ENTITLEMENTS);
  return {
    appId: options.id,
    productName: options.name,
    artifactName: '${productName}-${version}-${os}-${arch}.${ext}',
    electronVersion: electronVersion(),
    directories: { app: options.appDir, output: options.outDir },
    files: ['**/*'],
    asar: true,
    // Native addons are loaded from disk; Electron redirects to app.asar.unpacked.
    asarUnpack: ['native_modules/**'],
    // The app has no node_modules (addons ship in native_modules/): `false` tells electron-builder
    // not to install, rebuild or collect any, so it never picks up the workspace's packages.
    beforeBuild: async () => false,
    nodeGypRebuild: false,
    buildDependenciesFromSource: false,
    publish: null,
    ...(options.fuses ? { electronFuses: RELEASE_FUSES } : {}),
    ...(options.icon && existsSync(options.icon) ? { icon: options.icon } : {}),
    win: { target: targets },
    nsis: { oneClick: false, allowToChangeInstallationDirectory: true, perMachine: false },
    portable: { artifactName: '${productName}-${version}-portable.${ext}' },
    mac: {
      target: targets,
      category: 'public.app-category.games',
      hardenedRuntime: true,
      entitlements,
      entitlementsInherit: entitlements,
      // `null` turns signing off; electron-builder otherwise looks for any identity.
      ...(sign ? {} : { identity: null }),
      // Universal: both packs come from one staged app that already holds both architectures
      // (universal SDL binding, bytecode per arch); only steamworks.js's per-arch addons are the
      // same Mach-O file in both packs on purpose.
      ...(options.arch?.includes('universal') ? { x64ArchFiles: UNIVERSAL_X64_ARCH_FILES } : {}),
      notarize: sign && plan.notarize,
    },
    linux: {
      target: targets,
      category: 'Game',
      synopsis: options.name,
      // deb packages need a maintainer; games without one get the reverse of their id's domain.
      maintainer: `${options.name} <noreply@${options.id.split('.').slice(0, 2).reverse().join('.')}>`,
      syncDesktopName: true,
    },
    // Deep links (`<game id>:/oauth/callback`) open the game: registered by the installers.
    protocols: [{ name: options.name, schemes: [options.id] }],
  } as Configuration;
}

/**
 * Packages a staged app with electron-builder, using {@link builderConfig}. Certificates in the
 * environment are hidden from electron-builder when `sign` is `false`.
 *
 * @returns The files produced.
 *
 * @example
 * ```ts
 * import { packageApp } from '@blacklight/native/build';
 *
 * const files = await packageApp({ os: 'win', appDir, outDir: 'release', id, name, fuses: true });
 * ```
 */
export async function packageApp(options: PackageOptions): Promise<string[]> {
  const { build, Platform } = await import('electron-builder');
  const platform = { win: Platform.WINDOWS, mac: Platform.MAC, linux: Platform.LINUX }[options.os];
  const config = builderConfig(options);
  // electron-builder reads certificates from the environment: hide them when signing is off.
  const saved = { CSC_LINK: process.env.CSC_LINK, WIN_CSC_LINK: process.env.WIN_CSC_LINK };
  if (options.sign === false) {
    delete process.env.CSC_LINK;
    delete process.env.WIN_CSC_LINK;
  }
  try {
    return await build({
      targets: platform.createTarget(),
      config,
      projectDir: join(options.appDir, '..'),
      publish: 'never',
    });
  } finally {
    for (const [name, value] of Object.entries(saved))
      if (value !== undefined) process.env[name] = value;
  }
}

/**
 * Fuse states of an Electron executable, by fuse name (`'enabled'`, `'disabled'` or `'removed'`).
 * Used to verify that a packaged release has {@link RELEASE_FUSES}.
 *
 * @example
 * ```ts
 * import { readFuses } from '@blacklight/native/build';
 *
 * const fuses = await readFuses('release/linux-unpacked/my-game');
 * fuses.RunAsNode; // 'disabled'
 * ```
 */
export async function readFuses(
  executable: string,
): Promise<Record<string, 'enabled' | 'disabled' | 'removed'>> {
  const wire = await getCurrentFuseWire(executable);
  const out: Record<string, 'enabled' | 'disabled' | 'removed'> = {};
  for (const [name, index] of Object.entries(FuseV1Options)) {
    if (typeof index !== 'number') continue;
    const state = (wire as unknown as Record<number, FuseState>)[index];
    out[name] =
      state === FuseState.ENABLE ? 'enabled' : state === FuseState.DISABLE ? 'disabled' : 'removed';
  }
  return out;
}
