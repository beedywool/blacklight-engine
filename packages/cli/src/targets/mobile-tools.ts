// Finding the Android SDK and a JDK Gradle accepts, and running native tools.
import { spawnSync } from 'node:child_process';
import { existsSync, readdirSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';

/** Java versions the Android build accepts: Capacitor 8 compiles for 21, Gradle 8.14 runs on ≤ 24. */
export const JAVA_RANGE = { min: 21, max: 24 } as const;

/** Folders that may hold the Android SDK, in order: `ANDROID_HOME`, `ANDROID_SDK_ROOT`, Android Studio's default. */
export function androidSdkCandidates(
  env: Record<string, string | undefined> = process.env,
  platform: NodeJS.Platform = process.platform,
  home = homedir(),
): string[] {
  const defaults =
    platform === 'darwin'
      ? [join(home, 'Library', 'Android', 'sdk')]
      : platform === 'win32'
        ? [join(env.LOCALAPPDATA ?? join(home, 'AppData', 'Local'), 'Android', 'Sdk')]
        : [join(home, 'Android', 'Sdk'), join(home, 'Android', 'sdk')];
  return [env.ANDROID_HOME, env.ANDROID_SDK_ROOT, ...defaults].filter(
    (dir): dir is string => !!dir,
  );
}

/**
 * Android SDK folder, the first of {@link androidSdkCandidates} that has `platform-tools` or
 * `platforms`.
 *
 * @throws Error explaining how to install the SDK and set `ANDROID_HOME`.
 */
export function findAndroidSdk(
  env: Record<string, string | undefined> = process.env,
  platform: NodeJS.Platform = process.platform,
  home = homedir(),
): string {
  const candidates = androidSdkCandidates(env, platform, home);
  const sdk = candidates.find(
    (dir) => existsSync(join(dir, 'platform-tools')) || existsSync(join(dir, 'platforms')),
  );
  if (!sdk) {
    throw new Error(
      `No Android SDK found (looked in ${candidates.join(', ')}). Install Android Studio (https://developer.android.com/studio) or the command-line tools, then set ANDROID_HOME to the SDK folder.`,
    );
  }
  return sdk;
}

/** Major version printed by `java -version` (`"21.0.5"` → 21, `"1.8.0"` → 8). */
export function parseJavaVersion(output: string): number | undefined {
  const match = /version "(\d+)(?:\.(\d+))?/.exec(output);
  if (!match) return undefined;
  const major = Number(match[1]);
  return major === 1 ? Number(match[2]) : major;
}

function javaVersion(javaHome: string | undefined): number | undefined {
  const bin = javaHome
    ? join(javaHome, 'bin', process.platform === 'win32' ? 'java.exe' : 'java')
    : 'java';
  if (javaHome && !existsSync(bin)) return undefined;
  const result = spawnSync(bin, ['-version'], { encoding: 'utf8' });
  if (result.error) return undefined;
  return parseJavaVersion(`${result.stderr}${result.stdout}`);
}

/** JDK folders worth trying when `JAVA_HOME` is not set: Android Studio's bundled JBR, system JDKs. */
function javaCandidates(platform: NodeJS.Platform, home: string): string[] {
  const list: string[] = [];
  if (platform === 'darwin') {
    list.push('/Applications/Android Studio.app/Contents/jbr/Contents/Home');
    const vms = '/Library/Java/JavaVirtualMachines';
    if (existsSync(vms))
      for (const vm of readdirSync(vms)) list.push(join(vms, vm, 'Contents', 'Home'));
  } else if (platform === 'win32') {
    list.push('C:\\Program Files\\Android\\Android Studio\\jbr');
  } else {
    list.push(
      join(home, 'android-studio', 'jbr'),
      '/opt/android-studio/jbr',
      '/snap/android-studio/current/jbr',
    );
    for (const root of ['/usr/lib/jvm', '/usr/java']) {
      if (existsSync(root))
        for (const vm of readdirSync(root).sort().reverse()) list.push(join(root, vm));
    }
  }
  return list;
}

/**
 * A JDK the Android build accepts ({@link JAVA_RANGE}): `JAVA_HOME` when set, otherwise the
 * `java` on the PATH, Android Studio's JBR or an installed JDK.
 *
 * @returns The JDK folder to pass as `JAVA_HOME` (`undefined`: the PATH one is fine).
 * @throws Error naming the Java found and how to install a suitable one.
 */
export function findJava(
  env: Record<string, string | undefined> = process.env,
  platform: NodeJS.Platform = process.platform,
  home = homedir(),
  versionOf: (javaHome: string | undefined) => number | undefined = javaVersion,
): string | undefined {
  const fits = (version: number | undefined) =>
    version !== undefined && version >= JAVA_RANGE.min && version <= JAVA_RANGE.max;
  const wanted = `JDK ${JAVA_RANGE.min}–${JAVA_RANGE.max}`;
  if (env.JAVA_HOME) {
    const version = versionOf(env.JAVA_HOME);
    if (fits(version)) return env.JAVA_HOME;
    throw new Error(
      `JAVA_HOME (${env.JAVA_HOME}) is ${version ? `Java ${version}` : 'not a JDK'}; Android builds need ${wanted}. Point JAVA_HOME to JDK 21 (Android Studio ships one in its "jbr" folder).`,
    );
  }
  const onPath = versionOf(undefined);
  if (fits(onPath)) return undefined;
  const found = javaCandidates(platform, home).find((dir) => fits(versionOf(dir)));
  if (found) return found;
  throw new Error(
    `Android builds need ${wanted}; ${onPath ? `the java on your PATH is Java ${onPath}` : 'no java was found'}. Install JDK 21 (or Android Studio) and set JAVA_HOME to it.`,
  );
}

/**
 * Runs a native tool with inherited output.
 *
 * @throws Error naming the command when it fails.
 */
export function runTool(
  command: string,
  args: string[],
  options: { cwd: string; env?: NodeJS.ProcessEnv; what: string },
): void {
  const result = spawnSync(command, args, {
    cwd: options.cwd,
    env: options.env ?? process.env,
    stdio: 'inherit',
    shell: process.platform === 'win32' && /\.(bat|cmd)$/.test(command),
  });
  if (result.error) {
    throw new Error(
      `${options.what} failed: could not start ${command} (${result.error.message}).`,
    );
  }
  if (result.status !== 0) {
    throw new Error(
      `${options.what} failed (${command} ${args.join(' ')} exited with ${result.status}); the output above has the cause.`,
    );
  }
}
