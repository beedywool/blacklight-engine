import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { parse } from 'plist';
import { afterEach, describe, expect, it } from 'vitest';
import { ENGINE_PLUGINS, SQLITE_PLUGIN, pluginList } from '../src/targets/mobile';
import {
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
  versionCode,
  type MobileGame,
} from '../src/targets/mobile-native';
import { findAndroidSdk, findJava, parseJavaVersion } from '../src/targets/mobile-tools';

const game: MobileGame = {
  name: "Ada's Game",
  id: 'com.example.ada',
  version: '2.3.4',
  resolution: { width: 1920, height: 1080 },
};

const MANIFEST = `<manifest xmlns:android="http://schemas.android.com/apk/res/android">
    <application android:label="@string/app_name">
        <activity
            android:name=".MainActivity"
            android:exported="true">
            <intent-filter>
                <action android:name="android.intent.action.MAIN" />
                <category android:name="android.intent.category.LAUNCHER" />
            </intent-filter>
        </activity>
    </application>
</manifest>`;

let dir: string | undefined;
afterEach(() => {
  if (dir) rmSync(dir, { recursive: true, force: true });
  dir = undefined;
});

describe('mobile settings', () => {
  it('defaults from the resolution and keeps explicit values', () => {
    expect(mobileSettings(game)).toEqual({
      orientation: 'landscape',
      statusBar: 'hidden',
      keepAwake: true,
      gameCenter: false,
      playGamesAppId: undefined,
    });
    expect(mobileSettings({ resolution: { width: 720, height: 1280 } }).orientation).toBe(
      'portrait',
    );
    expect(mobileSettings({ ...game, mobile: { orientation: 'any' } }).orientation).toBe('any');
  });

  it('turns semver into an increasing Android versionCode', () => {
    expect(versionCode('2.3.4')).toBe(2_003_004);
    expect(versionCode('0.0.0')).toBe(1);
    expect(versionCode('1.0.0-beta.1')).toBe(1_000_000);
    expect(versionCode('1.10.0')).toBeGreaterThan(versionCode('1.9.99'));
    expect(() => versionCode('1.1000.0')).toThrow(/minor and patch ≤ 999/);
  });
});

describe('generated entry', () => {
  const transform = (code: string, id: string) =>
    (mobileEntry().transform as (code: string, id: string) => { code: string } | undefined)(
      code,
      id,
    );

  it('puts mobile() first in the plugin list of .blacklight/main.ts only', () => {
    const out = transform('const plugins = [ui()];', '/game/.blacklight/main.ts');
    expect(out?.code).toContain("import { mobile as blacklightMobile } from '@blacklight/mobile';");
    expect(out?.code).toContain('const plugins = [blacklightMobile(), ui()];');
    expect(transform('const plugins = [];', '/game/scenes/main.ts')).toBeUndefined();
    expect(() => transform('createGame()', '/game/.blacklight/main.ts')).toThrow(
      /versions do not match/,
    );
  });
});

describe('capacitor.config.json', () => {
  it('turns WebView inspection and logs off in release builds (SEC-07)', () => {
    const debug = capacitorConfig(game, { release: false, plugins: ['a'] });
    const release = capacitorConfig(game, { release: true, plugins: ['a'] });
    expect(debug).toMatchObject({
      appId: 'com.example.ada',
      appName: "Ada's Game",
      webDir: 'www',
      android: { webContentsDebuggingEnabled: true, includePlugins: ['a'] },
      ios: { webContentsDebuggingEnabled: true },
      plugins: { SystemBars: { hidden: true } },
    });
    expect(release).toMatchObject({
      loggingBehavior: 'none',
      android: { webContentsDebuggingEnabled: false },
      ios: { webContentsDebuggingEnabled: false },
    });
    const visible = capacitorConfig(
      { ...game, mobile: { statusBar: 'visible' } },
      { release: true, plugins: [] },
    );
    expect(visible).toMatchObject({ plugins: { SystemBars: { hidden: false } } });
  });
});

describe('Android project', () => {
  it('locks the orientation, adds the deep link and is idempotent', () => {
    const settings = mobileSettings(game);
    const once = patchAndroidManifest(MANIFEST, settings);
    expect(once).toContain('android:screenOrientation="sensorLandscape"');
    expect(once).toContain('android:scheme="@string/custom_url_scheme"');
    expect(once).not.toContain('games.APP_ID');
    expect(patchAndroidManifest(once, settings)).toBe(once);
    const portrait = patchAndroidManifest(once, { ...settings, orientation: 'portrait' });
    expect(portrait.match(/screenOrientation/g)).toHaveLength(1);
    expect(portrait).toContain('sensorPortrait');
    const games = patchAndroidManifest(once, { ...settings, playGamesAppId: '123' });
    expect(games).toContain(
      '<meta-data android:name="com.google.android.gms.games.APP_ID" android:value="@string/game_services_project_id" />',
    );
    expect(patchAndroidManifest(games, { ...settings, playGamesAppId: '123' })).toBe(games);
    expect(androidEngineValues({ ...settings, playGamesAppId: '123' })).toContain('>123</string>');
  });

  it('names the app, escapes resource text and sets the version and signing', () => {
    const strings = patchAndroidStrings(
      '<string name="app_name">My App</string><string name="custom_url_scheme">x</string>',
      game,
    );
    expect(strings).toContain(`<string name="app_name">Ada\\'s Game</string>`);
    expect(strings).toContain('<string name="custom_url_scheme">com.example.ada</string>');
    const gradle = patchAppGradle('versionCode 1\n        versionName "1.0"\n', game);
    expect(gradle).toContain('versionCode 2003004');
    expect(gradle).toContain('versionName "2.3.4"');
    expect(gradle).toContain("System.getenv('BLACKLIGHT_ANDROID_KEYSTORE')");
    expect(patchAppGradle(gradle, game)).toBe(gradle);
    expect(
      patchGradleWrapper(
        'distributionUrl=https\\://services.gradle.org/distributions/gradle-8.14.3-all.zip',
      ),
    ).toContain('gradle-8.14.3-bin.zip');
    const props = patchGradleProperties('org.gradle.jvmargs=-Xmx1536m\n', mobileSettings(game));
    expect(props).toBe('org.gradle.jvmargs=-Xmx1536m\nblacklightPlayGames=false\n');
    const withGames = patchGradleProperties(props, {
      ...mobileSettings(game),
      playGamesAppId: '1',
    });
    expect(withGames).toBe('org.gradle.jvmargs=-Xmx1536m\nblacklightPlayGames=true\n');
  });
});

describe('iOS project', () => {
  const INFO = `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0"><dict><key>CFBundleDisplayName</key><string>My App</string>
<key>UISupportedInterfaceOrientations</key><array><string>UIInterfaceOrientationPortrait</string></array>
</dict></plist>`;

  it('writes orientations, status bar, full screen and the URL scheme to Info.plist', () => {
    const info = parse(patchInfoPlist(INFO, game)) as Record<string, unknown>;
    expect(info).toMatchObject({
      CFBundleDisplayName: "Ada's Game",
      UISupportedInterfaceOrientations: [
        'UIInterfaceOrientationLandscapeLeft',
        'UIInterfaceOrientationLandscapeRight',
      ],
      UIStatusBarHidden: true,
      UIRequiresFullScreen: true,
      CFBundleURLTypes: [
        { CFBundleURLName: 'com.example.ada', CFBundleURLSchemes: ['com.example.ada'] },
      ],
    });
  });

  it('sets versions, bundle id and Game Center entitlements in the Xcode project', () => {
    const pbx = `MARKETING_VERSION = 1.0;\n\t\t\t\tCURRENT_PROJECT_VERSION = 1;\n\t\t\t\tINFOPLIST_FILE = App/Info.plist;\n\t\t\t\tPRODUCT_BUNDLE_IDENTIFIER = com.getcapacitor.app;`;
    const plain = patchPbxproj(pbx, game);
    expect(plain).toContain('MARKETING_VERSION = 2.3.4;');
    expect(plain).toContain('CURRENT_PROJECT_VERSION = 2003004;');
    expect(plain).toContain('PRODUCT_BUNDLE_IDENTIFIER = com.example.ada;');
    expect(plain).not.toContain('CODE_SIGN_ENTITLEMENTS');
    const gameCenter = patchPbxproj(plain, { ...game, mobile: { gameCenter: true } });
    expect(gameCenter).toContain('CODE_SIGN_ENTITLEMENTS = App/App.entitlements;');
    expect(patchPbxproj(gameCenter, { ...game, mobile: { gameCenter: true } })).toBe(gameCenter);
    expect(patchPbxproj(gameCenter, game)).not.toContain('CODE_SIGN_ENTITLEMENTS');
  });
});

describe('plugin list', () => {
  function project(dependencies: Record<string, string>) {
    dir = mkdtempSync(join(tmpdir(), 'blacklight-mobile-'));
    writeFileSync(join(dir, 'package.json'), JSON.stringify({ dependencies }));
    return dir;
  }

  it('adds native SQLite and the game’s own Capacitor plugins', () => {
    const root = project({ '@blacklight/core': '1', 'my-plugin': '1', 'not-a-plugin': '1' });
    for (const [name, meta] of [
      ['my-plugin', { capacitor: { android: { src: 'android' } } }],
      ['not-a-plugin', {}],
    ] as const) {
      mkdirSync(join(root, 'node_modules', name), { recursive: true });
      writeFileSync(join(root, 'node_modules', name, 'package.json'), JSON.stringify(meta));
    }
    expect(pluginList(root, {})).toEqual([...ENGINE_PLUGINS, 'my-plugin']);
    expect(pluginList(root, { modules: { sqlite: {} } })).toContain(SQLITE_PLUGIN);
    expect(pluginList(project({ '@blacklight/sqlite': '1' }), {})).toContain(SQLITE_PLUGIN);
    expect(pluginList(project({}), {}, true)).toContain(SQLITE_PLUGIN);
  });
});

describe('toolchain', () => {
  it('finds the Android SDK or says how to install it', () => {
    dir = mkdtempSync(join(tmpdir(), 'blacklight-sdk-'));
    mkdirSync(join(dir, 'platform-tools'));
    expect(findAndroidSdk({ ANDROID_HOME: dir }, 'linux', '/nowhere')).toBe(dir);
    expect(() => findAndroidSdk({}, 'linux', '/nowhere')).toThrow(/set ANDROID_HOME/);
  });

  it('accepts JDK 21 to 24 and explains anything else', () => {
    expect(parseJavaVersion('openjdk version "21.0.5" 2024-10-15')).toBe(21);
    expect(parseJavaVersion('java version "1.8.0_402"')).toBe(8);
    expect(parseJavaVersion('nonsense')).toBeUndefined();
    const versions: Record<string, number> = { '/jdk21': 21, '/jdk27': 27 };
    const versionOf = (home: string | undefined) => (home ? versions[home] : 27);
    expect(findJava({ JAVA_HOME: '/jdk21' }, 'linux', '/h', versionOf)).toBe('/jdk21');
    expect(() => findJava({ JAVA_HOME: '/jdk27' }, 'linux', '/h', versionOf)).toThrow(
      /JAVA_HOME \(\/jdk27\) is Java 27; Android builds need JDK 21–24/,
    );
    expect(() => findJava({}, 'linux', '/h', versionOf)).toThrow(
      /the java on your PATH is Java 27/,
    );
    expect(findJava({}, 'linux', '/h', (home) => (home ? undefined : 21))).toBeUndefined();
  });
});
