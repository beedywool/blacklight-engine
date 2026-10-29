// `blacklight build --target android|ios`: the web build embedded in a Capacitor project that the
// CLI generates in `.blacklight/mobile/`, then Gradle or Xcode.
import {
  copyFileSync,
  cpSync,
  existsSync,
  lstatSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  realpathSync,
  rmSync,
  symlinkSync,
  unlinkSync,
  writeFileSync,
} from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { build, mergeConfig } from 'vite';
import { loadGameConfig } from '../project';
import { GENERATED_DIR, createViteConfig } from '../vite';
import type { TargetBuilder, TargetOptions } from './index';
import {
  GAME_CENTER_ENTITLEMENTS,
  androidEngineValues,
  capacitorConfig,
  mobileEntry,
  mobileSettings,
  patchAndroidManifest,
  patchAndroidStrings,
  patchAppGradle,
  patchGradleProperties,
  patchGradleWrapper,
  patchInfoPlist,
  patchPbxproj,
  type MobileGame,
} from './mobile-native';
import { findAndroidSdk, findJava, runTool } from './mobile-tools';
import { runners, type RunOptions } from './runners';

export type MobileTarget = 'android' | 'ios';

/** Capacitor plugins every mobile build includes (the platform of `@blacklight/mobile`). */
export const ENGINE_PLUGINS = [
  '@blacklight/mobile',
  '@capacitor/app',
  '@capacitor/browser',
  '@capacitor/filesystem',
  '@capacitor/haptics',
  '@capacitor/screen-orientation',
  '@capacitor-community/keep-awake',
  'capacitor-secure-storage-plugin',
];

/** Native SQLite, added when the game uses the `sqlite` module (it weighs several MB per ABI). */
export const SQLITE_PLUGIN = '@capacitor-community/sqlite';

/** Flags of the mobile targets (`blacklight build --target android --release`). */
export interface MobileFlags {
  /** Release build (signed when the keystore or team id is configured). */
  release?: boolean;
  /** Android App Bundle for Google Play (implies `release`). */
  aab?: boolean;
  /** Install and start the build on a device or emulator. */
  run?: boolean;
  /** Device serial (`adb devices`) or simulator id (`xcrun simctl list`). */
  device?: string;
  /** Include native SQLite even when no dependency asks for it. */
  sqlite?: boolean;
}

const log = (message: string) => console.log(`\x1b[36mblacklight\x1b[0m ${message}`);

/** Folder of an installed package, found by walking `node_modules` folders up from `from`. */
export function packageDir(name: string, from: string): string | undefined {
  for (let dir = from; ; dir = dirname(dir)) {
    const candidate = join(dir, 'node_modules', name, 'package.json');
    if (existsSync(candidate)) return realpathSync(dirname(candidate));
    if (dirname(dir) === dir) return undefined;
  }
}

/** `@blacklight/mobile` from the game when it depends on it, else the copy the CLI ships with. */
export function mobilePackageDir(root: string): string {
  const cliDir = dirname(fileURLToPath(import.meta.url));
  const dir = packageDir('@blacklight/mobile', root) ?? packageDir('@blacklight/mobile', cliDir);
  if (!dir) {
    throw new Error(
      'Cannot find @blacklight/mobile. Reinstall @blacklight/cli, or add it to the game: pnpm add @blacklight/mobile',
    );
  }
  return dir;
}

function readJson(file: string): Record<string, unknown> {
  return JSON.parse(readFileSync(file, 'utf8')) as Record<string, unknown>;
}

/**
 * Capacitor plugins of the build: the engine's, native SQLite when the game uses the sqlite
 * module, and every Capacitor plugin the game depends on itself.
 */
export function pluginList(root: string, config: Record<string, unknown>, force = false): string[] {
  const plugins = [...ENGINE_PLUGINS];
  let deps: string[] = [];
  try {
    const manifest = readJson(join(root, 'package.json')) as {
      dependencies?: Record<string, string>;
    };
    deps = Object.keys(manifest.dependencies ?? {});
  } catch {
    // No package.json: engine plugins only.
  }
  const modules = config.modules;
  const usesSqlite =
    force ||
    deps.some((dep) => /(^|[/-])sqlite$/.test(dep)) ||
    (typeof modules === 'object' && modules !== null && 'sqlite' in modules);
  if (usesSqlite) plugins.push(SQLITE_PLUGIN);
  for (const dep of deps) {
    if (plugins.includes(dep)) continue;
    const dir = packageDir(dep, root);
    if (
      dir &&
      existsSync(join(dir, 'package.json')) &&
      readJson(join(dir, 'package.json')).capacitor
    ) {
      plugins.push(dep);
    }
  }
  return plugins;
}

function slug(name: string): string {
  return (
    name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '') || 'game'
  );
}

function link(target: string, path: string): void {
  if (existsSync(path) || isLink(path)) {
    if (isLink(path)) unlinkSync(path);
    else rmSync(path, { recursive: true, force: true });
  }
  mkdirSync(dirname(path), { recursive: true });
  // Junctions need no privileges on Windows; elsewhere the type is ignored.
  symlinkSync(target, path, 'junction');
}

function isLink(path: string): boolean {
  try {
    return lstatSync(path).isSymbolicLink();
  } catch {
    return false;
  }
}

/**
 * Makes `dir` a Capacitor app root: a `package.json` and `node_modules` links to the Capacitor
 * packages, resolved from `@blacklight/mobile` (engine plugins) or the game (its own plugins).
 */
function linkPackages(dir: string, root: string, names: string[]): void {
  const mobile = mobilePackageDir(root);
  const dependencies: Record<string, string> = {};
  rmSync(join(dir, 'node_modules'), { recursive: true, force: true });
  for (const name of names) {
    const found =
      name === '@blacklight/mobile' ? mobile : (packageDir(name, mobile) ?? packageDir(name, root));
    if (!found) {
      throw new Error(
        `Cannot find ${name} for the mobile build. Run your package manager's install again.`,
      );
    }
    link(found, join(dir, 'node_modules', name));
    dependencies[name] = String(readJson(join(found, 'package.json')).version);
  }
  writeFileSync(
    join(dir, 'package.json'),
    `${JSON.stringify({ name: 'blacklight-mobile-app', private: true, dependencies }, null, 2)}\n`,
  );
}

function capacitor(dir: string, args: string[]): void {
  const cliDir = dirname(fileURLToPath(import.meta.url));
  const cap = packageDir('@capacitor/cli', cliDir);
  if (!cap) throw new Error('Cannot find @capacitor/cli. Reinstall @blacklight/cli.');
  runTool(process.execPath, [join(cap, 'bin', 'capacitor'), ...args], {
    cwd: dir,
    what: `cap ${args.join(' ')}`,
    // Telemetry stays off; the CLI never prompts.
    env: { ...process.env, CAPACITOR_TELEMETRY: 'false', CI: process.env.CI ?? '1' },
  });
}

function edit(file: string, change: (text: string) => string): void {
  if (!existsSync(file)) return;
  const before = readFileSync(file, 'utf8');
  const after = change(before);
  if (after !== before) writeFileSync(file, after);
}

/** Builds the game's web bundle with the mobile plugin into `outDir`. */
async function buildMobileWeb(root: string, outDir: string): Promise<void> {
  const entry = join(mobilePackageDir(root), 'dist', 'index.js');
  if (!existsSync(entry)) {
    throw new Error(
      `${entry} is missing: build @blacklight/mobile first (pnpm build in the engine repository).`,
    );
  }
  await build(
    mergeConfig(createViteConfig(root), {
      plugins: [mobileEntry()],
      // Games need not depend on @blacklight/mobile: the CLI's copy is used then.
      resolve: { alias: [{ find: /^@blacklight\/mobile$/, replacement: entry }] },
      build: { outDir, emptyOutDir: true },
      // Production even when an earlier config load in this process set NODE_ENV=development.
      mode: 'production',
      define: { 'import.meta.env.DEV': 'false', 'import.meta.env.PROD': 'true' },
      logLevel: 'warn',
    }),
  );
}

/** What a native build works with. */
interface NativeProject {
  game: MobileGame & Record<string, unknown>;
  /** `.blacklight/mobile`: the Capacitor app root. */
  dir: string;
  release: boolean;
  flags: MobileFlags;
}

/**
 * Builds the web bundle, generates (first time) and syncs the Capacitor project for `target`,
 * applies `game.config.ts` to it and copies `mobile/<target>/` from the game over it.
 */
export async function prepareMobileProject(
  target: MobileTarget,
  options: TargetOptions,
): Promise<NativeProject> {
  const root = resolve(options.root);
  const flags = options.flags as MobileFlags;
  const release = !!(flags.release || flags.aab);
  const dir = join(root, GENERATED_DIR, 'mobile');
  mkdirSync(dir, { recursive: true });

  log(`building the web bundle for ${target}`);
  await buildMobileWeb(root, join(dir, 'www'));
  const game = (await loadGameConfig(root)) as unknown as NativeProject['game'];

  const plugins = pluginList(root, game, flags.sqlite);
  linkPackages(dir, root, [...new Set(['@capacitor/core', `@capacitor/${target}`, ...plugins])]);
  writeFileSync(
    join(dir, 'capacitor.config.json'),
    `${JSON.stringify(capacitorConfig(game, { release, plugins }), null, 2)}\n`,
  );

  if (!existsSync(join(dir, target))) {
    log(`generating the ${target} project in ${join(dir, target)}`);
    capacitor(dir, target === 'ios' ? ['add', 'ios', '--packagemanager', 'SPM'] : ['add', target]);
  }
  if (target === 'android') patchAndroid(join(dir, 'android'), game);
  else patchIos(join(dir, 'ios'), game);

  const overlay = join(root, 'mobile', target);
  if (existsSync(overlay)) {
    log(`copying mobile/${target}/ over the generated project`);
    cpSync(overlay, join(dir, target), { recursive: true });
  }
  capacitor(dir, ['sync', target]);
  return { game, dir, release, flags };
}

function patchAndroid(android: string, game: MobileGame): void {
  const settings = mobileSettings(game);
  const main = join(android, 'app', 'src', 'main');
  edit(join(android, 'gradle', 'wrapper', 'gradle-wrapper.properties'), patchGradleWrapper);
  edit(join(android, 'gradle.properties'), (text) => patchGradleProperties(text, settings));
  edit(join(main, 'AndroidManifest.xml'), (text) => patchAndroidManifest(text, settings));
  edit(join(main, 'res', 'values', 'strings.xml'), (text) => patchAndroidStrings(text, game));
  writeFileSync(join(main, 'res', 'values', 'blacklight.xml'), androidEngineValues(settings));
  edit(join(android, 'app', 'build.gradle'), (text) => patchAppGradle(text, game));
}

function patchIos(ios: string, game: MobileGame): void {
  const app = join(ios, 'App');
  edit(join(app, 'App', 'Info.plist'), (text) => patchInfoPlist(text, game));
  edit(join(app, 'App.xcodeproj', 'project.pbxproj'), (text) => patchPbxproj(text, game));
  const entitlements = join(app, 'App', 'App.entitlements');
  if (mobileSettings(game).gameCenter) writeFileSync(entitlements, GAME_CENTER_ENTITLEMENTS);
  else rmSync(entitlements, { force: true });
}

function output(root: string, target: MobileTarget): string {
  const dir = join(root, 'release', target);
  mkdirSync(dir, { recursive: true });
  return dir;
}

/** Android: generate/sync, then Gradle (debug APK, release APK or AAB) into `release/android/`. */
export async function buildAndroid(options: TargetOptions): Promise<string | undefined> {
  const root = resolve(options.root);
  // Fail before the web build when the toolchain is missing.
  const sdk = options.dryRun ? undefined : findAndroidSdk();
  const javaHome = options.dryRun ? undefined : findJava();
  const { game, dir, release, flags } = await prepareMobileProject('android', options);
  const android = join(dir, 'android');
  const task = flags.aab ? 'bundleRelease' : release ? 'assembleRelease' : 'assembleDebug';
  const gradlew = join(android, process.platform === 'win32' ? 'gradlew.bat' : 'gradlew');
  if (options.dryRun || !sdk) {
    log(
      `dry run: the Android project is ready in ${android}; the build would run: ${gradlew} ${task}`,
    );
    return undefined;
  }
  writeFileSync(join(android, 'local.properties'), `sdk.dir=${sdk.replace(/\\/g, '\\\\')}\n`);
  if (release && !process.env.ANDROID_KEYSTORE) {
    log('ANDROID_KEYSTORE is not set: the release build is unsigned (stores refuse it).');
  }
  log(`gradle ${task}`);
  runTool(gradlew, [task, '--console=plain'], {
    cwd: android,
    what: 'The Android build',
    env: { ...process.env, ANDROID_HOME: sdk, ...(javaHome ? { JAVA_HOME: javaHome } : {}) },
  });
  const outputs = join(android, 'app', 'build', 'outputs');
  const built = flags.aab
    ? join(outputs, 'bundle', 'release', 'app-release.aab')
    : release
      ? [
          join(outputs, 'apk', 'release', 'app-release.apk'),
          join(outputs, 'apk', 'release', 'app-release-unsigned.apk'),
        ].find(existsSync)!
      : join(outputs, 'apk', 'debug', 'app-debug.apk');
  const file = join(
    output(root, 'android'),
    `${slug(game.name)}-${game.version}${release ? '' : '-debug'}.${flags.aab ? 'aab' : 'apk'}`,
  );
  copyFileSync(built, file);
  log(`wrote ${file}`);
  if (flags.run) {
    if (flags.aab)
      throw new Error('--run installs an APK; drop --aab to run the build on a device.');
    const adb = join(sdk, 'platform-tools', process.platform === 'win32' ? 'adb.exe' : 'adb');
    const device = flags.device ? ['-s', flags.device] : [];
    runTool(adb, [...device, 'install', '-r', file], {
      cwd: root,
      // The usual cause: the device has the app signed with another key (debug vs release).
      what: `Installing the APK (if adb says INSTALL_FAILED_UPDATE_INCOMPATIBLE, the device has ${game.id} signed with another key: remove it with \`adb uninstall ${game.id}\`, which deletes its data)`,
    });
    runTool(adb, [...device, 'shell', 'am', 'start', '-n', `${game.id}/.MainActivity`], {
      cwd: root,
      what: 'Starting the app',
    });
  }
  return file;
}

/**
 * iOS: generate/sync, then Xcode. Debug builds target the iOS Simulator; release builds archive
 * and export an `.ipa` signed for `APPLE_TEAM_ID`. Only macOS has Xcode.
 */
export async function buildIos(options: TargetOptions): Promise<string | undefined> {
  const root = resolve(options.root);
  const { game, dir, release, flags } = await prepareMobileProject('ios', options);
  const project = join(dir, 'ios', 'App', 'App.xcodeproj');
  const derived = join(dir, 'ios-build');
  const debugArgs = [
    '-project',
    project,
    '-scheme',
    'App',
    '-configuration',
    'Debug',
    '-sdk',
    'iphonesimulator',
    '-derivedDataPath',
    derived,
    'CODE_SIGNING_ALLOWED=NO',
    'build',
  ];
  const archive = join(derived, 'App.xcarchive');
  const archiveArgs = [
    '-project',
    project,
    '-scheme',
    'App',
    '-configuration',
    'Release',
    '-destination',
    'generic/platform=iOS',
    '-archivePath',
    archive,
    'archive',
    `DEVELOPMENT_TEAM=${process.env.APPLE_TEAM_ID ?? ''}`,
  ];
  if (options.dryRun) {
    log(
      `dry run: the Xcode project is ready in ${project}; the build would run: xcodebuild ${(release ? archiveArgs : debugArgs).join(' ')}`,
    );
    return undefined;
  }
  if (process.platform !== 'darwin') {
    throw new Error(
      `Building for iOS needs macOS with Xcode (Apple's compiler and signing tools exist only there). The Xcode project is ready in ${project}: build it on a Mac with \`blacklight build --target ios\`, or in the macOS job of the GitHub Actions workflow. Add --dry-run to only generate the project.`,
    );
  }
  const out = output(root, 'ios');
  if (!release) {
    runTool('xcodebuild', debugArgs, { cwd: dir, what: 'The iOS Simulator build' });
    const app = join(out, `${slug(game.name)}.app`);
    rmSync(app, { recursive: true, force: true });
    cpSync(join(derived, 'Build', 'Products', 'Debug-iphonesimulator', 'App.app'), app, {
      recursive: true,
    });
    log(`wrote ${app}`);
    if (flags.run) {
      const device = flags.device ?? 'booted';
      runTool('xcrun', ['simctl', 'install', device, app], {
        cwd: root,
        what: 'Installing on the simulator',
      });
      runTool('xcrun', ['simctl', 'launch', device, game.id], {
        cwd: root,
        what: 'Starting the app',
      });
    }
    return app;
  }
  if (!process.env.APPLE_TEAM_ID) {
    throw new Error(
      'iOS release builds are signed for an Apple developer team: set APPLE_TEAM_ID to your team id (developer.apple.com → Membership), with its certificates in the keychain.',
    );
  }
  runTool('xcodebuild', archiveArgs, { cwd: dir, what: 'The iOS archive' });
  const exportOptions = join(derived, 'ExportOptions.plist');
  writeFileSync(
    exportOptions,
    `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0"><dict>
<key>method</key><string>app-store-connect</string>
<key>teamID</key><string>${process.env.APPLE_TEAM_ID}</string>
<key>signingStyle</key><string>automatic</string>
</dict></plist>
`,
  );
  runTool(
    'xcodebuild',
    [
      '-exportArchive',
      '-archivePath',
      archive,
      '-exportOptionsPlist',
      exportOptions,
      '-exportPath',
      out,
      '-allowProvisioningUpdates',
    ],
    { cwd: dir, what: 'Exporting the .ipa' },
  );
  const ipa = readdirSync(out).find((file) => file.endsWith('.ipa'));
  log(`wrote ${ipa ? join(out, ipa) : out}`);
  return ipa ? join(out, ipa) : out;
}

/** The mobile entries of the CLI target registry. */
export const mobileTargets: Record<MobileTarget, TargetBuilder> = {
  android: async (options) => void (await buildAndroid(options)),
  ios: async (options) => void (await buildIos(options)),
};

/**
 * Builds a debug version and starts it on a connected device or emulator (Android) or the booted
 * iOS Simulator: `blacklight run --target android|ios` (registered in {@link runners}).
 *
 * @example
 * ```ts
 * await runMobile('android', { root: '.', device: 'emulator-5554', flags: {} });
 * ```
 */
export async function runMobile(target: MobileTarget, options: RunOptions): Promise<void> {
  const device = options.device ?? (options.flags.device as string | undefined);
  const run = { ...options, flags: { ...options.flags, run: true, device } };
  await (target === 'android' ? buildAndroid(run) : buildIos(run));
}

runners.android = (options) => runMobile('android', options);
runners.ios = (options) => runMobile('ios', options);
