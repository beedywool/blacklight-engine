// Pure edits of the generated Capacitor project (Android manifest, Gradle files, iOS Info.plist,
// Xcode project). Each function takes the current text and returns the new one, so builds can
// run them on every sync without piling up changes.
import { build as buildPlist, parse as parsePlist, type PlistValue } from 'plist';
import type { Plugin } from 'vite';

/** The `mobile` section of `game.config.ts` with defaults applied (see `@blacklight/mobile`). */
export interface MobileSettings {
  orientation: 'landscape' | 'portrait' | 'any';
  statusBar: 'hidden' | 'visible';
  keepAwake: boolean;
  gameCenter: boolean;
  playGamesAppId?: string;
}

/** What the native project needs from `game.config.ts`. */
export interface MobileGame {
  name: string;
  id: string;
  version: string;
  resolution: { width: number; height: number };
  mobile?: Partial<MobileSettings>;
}

/** Applies the defaults of the `mobile` section (same rules as `resolveMobileConfig`). */
export function mobileSettings(game: Pick<MobileGame, 'resolution' | 'mobile'>): MobileSettings {
  const { mobile = {}, resolution } = game;
  return {
    orientation:
      mobile.orientation ?? (resolution.width >= resolution.height ? 'landscape' : 'portrait'),
    statusBar: mobile.statusBar ?? 'hidden',
    keepAwake: mobile.keepAwake ?? true,
    gameCenter: mobile.gameCenter ?? false,
    playGamesAppId: mobile.playGamesAppId,
  };
}

/**
 * Android `versionCode` from a semver version: `major * 1_000_000 + minor * 1_000 + patch`, so
 * every release sorts above the previous one. Pre-release tags share their release's code.
 *
 * @throws Error when a part is too large for the scheme.
 */
export function versionCode(version: string): number {
  const [major = 0, minor = 0, patch = 0] = version
    .split(/[-+]/)[0]!
    .split('.')
    .map((part) => Number(part));
  if (minor > 999 || patch > 999 || major > 2100) {
    throw new Error(
      `Version ${version} does not fit an Android versionCode (major ≤ 2100, minor and patch ≤ 999). Use a smaller version in game.config.ts.`,
    );
  }
  return major * 1_000_000 + minor * 1_000 + patch || 1;
}

const ENTRY_MARKER = 'const plugins = [';

/**
 * Vite plugin that adds the `mobile()` game plugin to the generated entry, first in the list so
 * the platform is in place before other plugins run. Web builds do not get it.
 */
export function mobileEntry(): Plugin {
  return {
    name: 'blacklight:mobile-entry',
    enforce: 'pre',
    transform(code, id) {
      if (!/[\\/]\.blacklight[\\/]main\.ts$/.test(id)) return undefined;
      if (!code.includes(ENTRY_MARKER)) {
        throw new Error(
          'The generated .blacklight/main.ts has no plugin list; @blacklight/cli and @blacklight/mobile versions do not match. Update both to the same version.',
        );
      }
      return {
        code: `import { mobile as blacklightMobile } from '@blacklight/mobile';\n${code.replace(
          ENTRY_MARKER,
          `${ENTRY_MARKER}blacklightMobile(), `,
        )}`,
        map: null,
      };
    },
  };
}

/** `capacitor.config.json` of the generated project. */
export function capacitorConfig(
  game: MobileGame,
  options: { release: boolean; plugins: string[] },
): Record<string, unknown> {
  const settings = mobileSettings(game);
  // SEC-07: the WebView is inspectable in debug builds only.
  const platform = {
    webContentsDebuggingEnabled: !options.release,
    includePlugins: options.plugins,
  };
  return {
    appId: game.id,
    appName: game.name,
    webDir: 'www',
    loggingBehavior: options.release ? 'none' : 'debug',
    server: { androidScheme: 'https' },
    android: { path: 'android', ...platform },
    ios: { path: 'ios', ...platform },
    plugins: {
      SystemBars: { hidden: settings.statusBar === 'hidden', insetsHandling: 'css', style: 'DARK' },
      CapacitorSQLite: { iosDatabaseLocation: 'Library/CapacitorDatabase' },
    },
  };
}

function escapeXml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, "\\'");
}

const ANDROID_ORIENTATION = {
  landscape: 'sensorLandscape',
  portrait: 'sensorPortrait',
  any: 'fullUser',
};
const PLAY_GAMES_META = 'com.google.android.gms.games.APP_ID';

/**
 * `AndroidManifest.xml` of the app: orientation lock, a deep-link intent filter for the game id
 * as URL scheme, the Play Games project id when configured.
 */
export function patchAndroidManifest(manifest: string, settings: MobileSettings): string {
  let out = manifest.replace(/\s*android:screenOrientation="[^"]*"/, '');
  out = out.replace(
    /(<activity\b[^>]*android:name="\.MainActivity")/,
    `$1\n            android:screenOrientation="${ANDROID_ORIENTATION[settings.orientation]}"`,
  );
  const deepLink = `<!-- blacklight:deeplink -->
            <intent-filter>
                <action android:name="android.intent.action.VIEW" />
                <category android:name="android.intent.category.DEFAULT" />
                <category android:name="android.intent.category.BROWSABLE" />
                <data android:scheme="@string/custom_url_scheme" />
            </intent-filter>`;
  if (!out.includes('<!-- blacklight:deeplink -->')) {
    out = out.replace(/(<\/intent-filter>)(\s*<\/activity>)/, `$1\n\n            ${deepLink}$2`);
  }
  out = out.replace(new RegExp(`\\s*<meta-data android:name="${PLAY_GAMES_META}"[^>]*/>`), '');
  if (settings.playGamesAppId) {
    out = out.replace(
      /(\s*)<\/application>/,
      `$1    <meta-data android:name="${PLAY_GAMES_META}" android:value="@string/game_services_project_id" />$1</application>`,
    );
  }
  return out;
}

/** `res/values/strings.xml`: app name and URL scheme follow `game.config.ts`. */
export function patchAndroidStrings(strings: string, game: MobileGame): string {
  const set = (text: string, name: string, value: string) =>
    text.replace(
      new RegExp(`(<string name="${name}">)[^<]*(</string>)`),
      `$1${escapeXml(value)}$2`,
    );
  let out = set(strings, 'app_name', game.name);
  out = set(out, 'title_activity_main', game.name);
  out = set(out, 'package_name', game.id);
  out = set(out, 'custom_url_scheme', game.id);
  return out;
}

/** `res/values/blacklight.xml`: resources the engine's native code reads. */
export function androidEngineValues(settings: MobileSettings): string {
  return `<?xml version="1.0" encoding="utf-8"?>
<!-- Generated by blacklight build from game.config.ts. -->
<resources>
    <string name="game_services_project_id" translatable="false">${settings.playGamesAppId ?? ''}</string>
</resources>
`;
}

const SIGNING_MARKER = '// blacklight: release signing';

/**
 * `app/build.gradle`: version from `game.config.ts`, and release signing from the
 * `ANDROID_KEYSTORE*` environment variables (no secret is written to disk).
 */
export function patchAppGradle(gradle: string, game: MobileGame): string {
  let out = gradle
    .replace(/versionCode \d+/, `versionCode ${versionCode(game.version)}`)
    .replace(/versionName "[^"]*"/, `versionName "${game.version}"`);
  // The block always ends the file: rewrite it so projects generated by older CLIs follow along.
  const marker = out.indexOf(`\n${SIGNING_MARKER}`);
  if (marker >= 0) out = out.slice(0, marker);
  return `${out}
${SIGNING_MARKER} (ANDROID_KEYSTORE, ANDROID_KEYSTORE_PASSWORD, ANDROID_KEY_ALIAS, ANDROID_KEY_PASSWORD)
android {
    signingConfigs {
        blacklight {
            def keystore = System.getenv('ANDROID_KEYSTORE')
            if (keystore) {
                storeFile file(keystore)
                storePassword System.getenv('ANDROID_KEYSTORE_PASSWORD')
                keyAlias System.getenv('ANDROID_KEY_ALIAS')
                keyPassword System.getenv('ANDROID_KEY_PASSWORD') ?: System.getenv('ANDROID_KEYSTORE_PASSWORD')
            }
        }
    }
    buildTypes {
        release {
            if (System.getenv('ANDROID_KEYSTORE')) {
                signingConfig signingConfigs.blacklight
            }
        }
    }
}
`;
}

/**
 * `gradle.properties`: `blacklightPlayGames` compiles Google's Play Games SDK into the app only
 * when the game has a Play Games project id (the SDK is proprietary; other games ship without it).
 */
export function patchGradleProperties(properties: string, settings: MobileSettings): string {
  const kept = properties.replace(/\n?blacklightPlayGames=.*/g, '').replace(/\n*$/, '');
  return `${kept}\nblacklightPlayGames=${settings.playGamesAppId ? 'true' : 'false'}\n`;
}

/** Gradle wrapper: the `bin` distribution (the template's `all` adds 100 MB of sources). */
export function patchGradleWrapper(properties: string): string {
  return properties.replace(/(gradle-[\d.]+)-all\.zip/, '$1-bin.zip');
}

const IOS_ORIENTATIONS = {
  landscape: ['UIInterfaceOrientationLandscapeLeft', 'UIInterfaceOrientationLandscapeRight'],
  portrait: ['UIInterfaceOrientationPortrait'],
  any: [
    'UIInterfaceOrientationPortrait',
    'UIInterfaceOrientationLandscapeLeft',
    'UIInterfaceOrientationLandscapeRight',
  ],
};

/** `Info.plist`: name, orientations, status bar, full screen on iPad, deep-link scheme. */
export function patchInfoPlist(text: string, game: MobileGame): string {
  const settings = mobileSettings(game);
  const info = parsePlist(text) as Record<string, unknown>;
  info.CFBundleDisplayName = game.name;
  info.UISupportedInterfaceOrientations = IOS_ORIENTATIONS[settings.orientation];
  info['UISupportedInterfaceOrientations~ipad'] =
    settings.orientation === 'portrait'
      ? ['UIInterfaceOrientationPortrait', 'UIInterfaceOrientationPortraitUpsideDown']
      : IOS_ORIENTATIONS[settings.orientation];
  info.UIStatusBarHidden = settings.statusBar === 'hidden';
  // Games do not share the screen with other apps (iPad split view would resize the canvas).
  info.UIRequiresFullScreen = true;
  info.CFBundleURLTypes = [{ CFBundleURLName: game.id, CFBundleURLSchemes: [game.id] }];
  return buildPlist(info as PlistValue);
}

/** `App.entitlements` with Game Center. */
export const GAME_CENTER_ENTITLEMENTS = buildPlist({ 'com.apple.developer.game-center': true });

/** `project.pbxproj`: version, build number, bundle id and the entitlements file. */
export function patchPbxproj(text: string, game: MobileGame): string {
  const settings = mobileSettings(game);
  let out = text
    .replace(/MARKETING_VERSION = [^;]+;/g, `MARKETING_VERSION = ${game.version.split(/[-+]/)[0]};`)
    .replace(
      /CURRENT_PROJECT_VERSION = [^;]+;/g,
      `CURRENT_PROJECT_VERSION = ${versionCode(game.version)};`,
    )
    .replace(/PRODUCT_BUNDLE_IDENTIFIER = [^;]+;/g, `PRODUCT_BUNDLE_IDENTIFIER = ${game.id};`)
    .replace(/\s*CODE_SIGN_ENTITLEMENTS = [^;]+;/g, '');
  if (settings.gameCenter) {
    out = out.replace(
      /(\n(\s*)INFOPLIST_FILE = App\/Info\.plist;)/g,
      '\n$2CODE_SIGN_ENTITLEMENTS = App/App.entitlements;$1',
    );
  }
  return out;
}
