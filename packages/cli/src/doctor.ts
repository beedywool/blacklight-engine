import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { createRequire } from 'node:module';
import { join } from 'node:path';

/** What a check can see of the machine; replaced in tests. */
export interface DoctorEnv {
  platform: NodeJS.Platform;
  nodeVersion: string;
  env: Record<string, string | undefined>;
  /** Runs a command; returns its output (stdout + stderr) or `undefined` when it cannot run. */
  exec(command: string, args: string[]): string | undefined;
  exists(path: string): boolean;
  /** Resolves a package from the game folder; `undefined` when it is not installed. */
  resolve(name: string): string | undefined;
}

/** Result of one check. */
export interface CheckResult {
  ok: boolean;
  /** What was found (a version, a path) or what is missing. */
  detail: string;
  /** How to fix it, when not ok. */
  fix?: string;
}

/** A requirement of one or more targets. */
export interface DoctorCheck {
  /** Short name: "Node.js", "Android SDK". */
  name: string;
  /** Optional checks (signing) do not make a target unavailable. */
  optional?: boolean;
  run(env: DoctorEnv): CheckResult;
}

/** One line of the report. */
export interface CheckReport extends CheckResult {
  name: string;
  optional: boolean;
}

/** What one target needs and what was found. */
export interface TargetReport {
  target: string;
  /** Every required check passed. */
  ready: boolean;
  checks: CheckReport[];
}

const MIN_NODE = 24;

function firstLine(text: string): string {
  return text.trim().split(/\r?\n/)[0] ?? '';
}

const node: DoctorCheck = {
  name: 'Node.js',
  run: ({ nodeVersion }) => {
    const major = Number(/^v?(\d+)/.exec(nodeVersion)?.[1] ?? 0);
    return major >= MIN_NODE
      ? { ok: true, detail: nodeVersion }
      : {
          ok: false,
          detail: `${nodeVersion} (needs ${MIN_NODE} or later)`,
          fix: `Install Node.js ${MIN_NODE} LTS or later from https://nodejs.org.`,
        };
  },
};

const pnpm: DoctorCheck = {
  name: 'pnpm',
  run: ({ exec }) => {
    const version = exec('pnpm', ['--version']);
    return version
      ? { ok: true, detail: firstLine(version) }
      : {
          ok: false,
          detail: 'not found',
          fix: 'Run `npm install -g pnpm` (or `corepack enable`).',
        };
  },
};

const electron: DoctorCheck = {
  name: 'Electron',
  run: ({ resolve }) => {
    const found = resolve('electron/package.json');
    return found
      ? { ok: true, detail: found.replace(/[\\/]package\.json$/, '') }
      : {
          ok: false,
          detail: 'not installed in this game',
          fix: 'Run `pnpm add -D electron @blacklight/native` in the game folder.',
        };
  },
};

const windowsSigning: DoctorCheck = {
  name: 'Windows code signing certificate',
  optional: true,
  run: ({ env }) => {
    const link = env.WIN_CSC_LINK ?? env.CSC_LINK;
    return link
      ? { ok: true, detail: `certificate from ${env.WIN_CSC_LINK ? 'WIN_CSC_LINK' : 'CSC_LINK'}` }
      : {
          ok: false,
          detail: 'no certificate configured (builds are unsigned)',
          fix: 'Set WIN_CSC_LINK to the .pfx file (or base64) and WIN_CSC_KEY_PASSWORD to its password.',
        };
  },
};

const macHost: DoctorCheck = {
  name: 'macOS host',
  run: ({ platform }) =>
    platform === 'darwin'
      ? { ok: true, detail: 'macOS' }
      : {
          ok: false,
          detail: `this machine runs ${platform}`,
          fix: 'Build mac and iOS targets on a Mac (or a macOS CI runner).',
        },
};

const xcode: DoctorCheck = {
  name: 'Xcode',
  run: ({ platform, exec }) => {
    if (platform !== 'darwin') return { ok: false, detail: 'needs macOS', fix: 'Use a Mac.' };
    const version = exec('xcodebuild', ['-version']);
    return version
      ? { ok: true, detail: firstLine(version) }
      : {
          ok: false,
          detail: 'xcodebuild not found',
          fix: 'Install Xcode from the App Store, then run `sudo xcode-select -s /Applications/Xcode.app`.',
        };
  },
};

const xcodeTools: DoctorCheck = {
  name: 'Xcode command line tools',
  run: ({ platform, exec }) => {
    if (platform !== 'darwin') return { ok: false, detail: 'needs macOS', fix: 'Use a Mac.' };
    const path = exec('xcode-select', ['-p']);
    return path
      ? { ok: true, detail: firstLine(path) }
      : { ok: false, detail: 'not installed', fix: 'Run `xcode-select --install`.' };
  },
};

/** Code signing identities known to the keychain, matching `kind`. */
function identities(exec: DoctorEnv['exec'], kind: RegExp): string[] {
  const output = exec('security', ['find-identity', '-v', '-p', 'codesigning']) ?? '';
  return output
    .split(/\r?\n/)
    .map((line) => /"(.+)"/.exec(line)?.[1])
    .filter((name): name is string => !!name && kind.test(name));
}

const macSigning: DoctorCheck = {
  name: 'Developer ID certificate and notarization',
  optional: true,
  run: ({ platform, exec, env }) => {
    if (platform !== 'darwin') return { ok: false, detail: 'needs macOS', fix: 'Use a Mac.' };
    const found = identities(exec, /^Developer ID Application/);
    const notarize = env.APPLE_ID && env.APPLE_APP_SPECIFIC_PASSWORD && env.APPLE_TEAM_ID;
    if (found.length === 0)
      return {
        ok: false,
        detail: 'no "Developer ID Application" identity in the keychain',
        fix: 'Create one at developer.apple.com (Certificates) and open it in Keychain Access.',
      };
    if (!notarize)
      return {
        ok: false,
        detail: `${found[0]}; notarization not configured`,
        fix: 'Set APPLE_ID, APPLE_APP_SPECIFIC_PASSWORD and APPLE_TEAM_ID.',
      };
    return { ok: true, detail: found[0]! };
  },
};

const iosSigning: DoctorCheck = {
  name: 'Apple development team and distribution certificate',
  optional: true,
  run: ({ platform, exec, env }) => {
    if (platform !== 'darwin') return { ok: false, detail: 'needs macOS', fix: 'Use a Mac.' };
    const found = identities(exec, /^(Apple Distribution|iPhone Distribution|Apple Development)/);
    if (found.length === 0 || !env.APPLE_TEAM_ID)
      return {
        ok: false,
        detail:
          found.length === 0 ? 'no Apple Development/Distribution identity' : 'APPLE_TEAM_ID unset',
        fix: 'Sign in to your Apple account in Xcode (Settings > Accounts) and set APPLE_TEAM_ID.',
      };
    return { ok: true, detail: `${found[0]} (team ${env.APPLE_TEAM_ID})` };
  },
};

const java: DoctorCheck = {
  name: 'Java (JDK 21)',
  run: ({ exec, env }) => {
    const javaBin = env.JAVA_HOME ? join(env.JAVA_HOME, 'bin', 'java') : 'java';
    const output = exec(javaBin, ['-version']);
    if (!output)
      return {
        ok: false,
        detail: 'java not found',
        fix: 'Install a JDK 21 (Temurin or the one bundled with Android Studio) and set JAVA_HOME.',
      };
    const major = Number(/version "(\d+)/.exec(output)?.[1] ?? 0);
    return major >= 21
      ? { ok: true, detail: firstLine(output) }
      : {
          ok: false,
          detail: `${firstLine(output)} (needs 21 or later)`,
          fix: 'Install a JDK 21 and point JAVA_HOME to it.',
        };
  },
};

const androidSdk: DoctorCheck = {
  name: 'Android SDK',
  run: ({ env, exists, platform }) => {
    const sdk = env.ANDROID_HOME ?? env.ANDROID_SDK_ROOT;
    if (!sdk)
      return {
        ok: false,
        detail: 'ANDROID_HOME is not set',
        fix: 'Install Android Studio (or the command line tools) and set ANDROID_HOME to the SDK folder.',
      };
    const adb = join(sdk, 'platform-tools', platform === 'win32' ? 'adb.exe' : 'adb');
    return exists(adb)
      ? { ok: true, detail: sdk }
      : {
          ok: false,
          detail: `${sdk} has no platform-tools`,
          fix: 'Run `sdkmanager "platform-tools" "platforms;android-35" "build-tools;35.0.0"`.',
        };
  },
};

const androidSigning: DoctorCheck = {
  name: 'Android release keystore',
  optional: true,
  run: ({ env, exists }) => {
    const store = env.ANDROID_KEYSTORE;
    if (!store)
      return {
        ok: false,
        detail: 'no keystore configured (release builds are unsigned)',
        fix: 'Set ANDROID_KEYSTORE, ANDROID_KEYSTORE_PASSWORD, ANDROID_KEY_ALIAS and ANDROID_KEY_PASSWORD.',
      };
    return exists(store)
      ? { ok: true, detail: store }
      : { ok: false, detail: `${store} does not exist`, fix: 'Fix the ANDROID_KEYSTORE path.' };
  },
};

const steamworks: DoctorCheck = {
  name: 'steamcmd (uploads)',
  optional: true,
  run: ({ exec }) => {
    const output = exec('steamcmd', ['+quit']);
    return output
      ? { ok: true, detail: 'steamcmd found' }
      : {
          ok: false,
          detail: 'steamcmd not found (builds work; uploading to Steam does not)',
          fix: 'Install steamcmd from developer.valvesoftware.com/wiki/SteamCMD.',
        };
  },
};

/**
 * What each target needs. Platform areas append their own checks here.
 *
 * @example
 * ```ts
 * doctorChecks.android.push({ name: 'Gradle cache', run: () => ({ ok: true, detail: 'ok' }) });
 * ```
 */
export const doctorChecks: Record<string, DoctorCheck[]> = {
  web: [node, pnpm],
  win: [node, pnpm, electron, windowsSigning],
  mac: [node, pnpm, macHost, xcodeTools, electron, macSigning],
  linux: [node, pnpm, electron],
  steam: [node, pnpm, electron, steamworks],
  android: [node, pnpm, java, androidSdk, androidSigning],
  ios: [node, pnpm, macHost, xcode, iosSigning],
};

/** The real machine, with packages resolved from `root`. */
export function systemEnv(root: string): DoctorEnv {
  const require = createRequire(join(root, 'package.json'));
  return {
    platform: process.platform,
    nodeVersion: process.version,
    env: process.env,
    exec(command, args) {
      const result = spawnSync(command, args, {
        encoding: 'utf8',
        timeout: 15_000,
        shell: process.platform === 'win32',
      });
      if (result.error || result.status !== 0) return undefined;
      return `${result.stdout}${result.stderr}`;
    },
    exists: existsSync,
    resolve(name) {
      try {
        return require.resolve(name);
      } catch {
        return undefined;
      }
    },
  };
}

/** Runs the checks of each target; a check shared by targets runs once. */
export function runDoctor(env: DoctorEnv, only?: string[]): TargetReport[] {
  const cache = new Map<DoctorCheck, CheckResult>();
  return Object.entries(doctorChecks)
    .filter(([target]) => !only || only.includes(target))
    .map(([target, checks]) => {
      const results = checks.map((check) => {
        if (!cache.has(check)) {
          let result: CheckResult;
          try {
            result = check.run(env);
          } catch (error) {
            result = { ok: false, detail: error instanceof Error ? error.message : String(error) };
          }
          cache.set(check, result);
        }
        return { name: check.name, optional: !!check.optional, ...cache.get(check)! };
      });
      return { target, ready: results.every((r) => r.ok || r.optional), checks: results };
    });
}

/** Plain-text report, one block per target. */
export function formatDoctor(reports: TargetReport[], color = false): string {
  const paint = (code: number, text: string) => (color ? `\x1b[${code}m${text}\x1b[0m` : text);
  const lines: string[] = [];
  for (const report of reports) {
    lines.push(
      `${paint(1, report.target)}  ${report.ready ? paint(32, 'ready') : paint(31, 'not ready')}`,
    );
    for (const check of report.checks) {
      const status = check.ok
        ? paint(32, 'ok     ')
        : check.optional
          ? paint(33, 'warning')
          : paint(31, 'missing');
      lines.push(`  ${status} ${check.name}: ${check.detail}`);
      if (!check.ok && check.fix) lines.push(`          ${paint(2, check.fix)}`);
    }
    lines.push('');
  }
  return lines.join('\n');
}
