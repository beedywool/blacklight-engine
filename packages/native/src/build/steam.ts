// Steam depot upload (PF-05, L6): VDF build scripts for steamcmd and the command that uploads them.
// Without a Steamworks partner account the upload runs in dry-run mode only.

import { mkdirSync, writeFileSync } from 'node:fs';
import { join, relative } from 'node:path';
import type { DesktopOs } from './sign';

/** Options of {@link writeSteamScripts}. */
export interface SteamUploadOptions {
  /** Steam app id (`steam.appId` in `game.config.ts`). */
  appId: number;
  /** Depot per OS; defaults to `appId + 1` (Windows), `+ 2` (macOS), `+ 3` (Linux). */
  depots?: {
    /** Windows depot id. */
    windows?: number;
    /** macOS depot id. */
    mac?: number;
    /** Linux depot id. */
    linux?: number;
  };
  /** Folder with one unpacked build per OS: `content/<win|mac|linux>/`. */
  steamDir: string;
  /** OS builds present in `content/`. */
  oses: DesktopOs[];
  /** Build description shown on the Steamworks site. */
  description: string;
  /** Branch to set the build live on (never `default` from the CLI). */
  branch?: string;
}

const OS_KEY = { win: 'windows', mac: 'mac', linux: 'linux' } as const;

/**
 * Depot ID of an OS: the configured one, or the app id plus 1 (Windows), 2 (macOS) or 3 (Linux),
 * the ids Steamworks gives the first depots of a new app.
 *
 * @example
 * ```ts
 * import { depotId } from '@blacklight/native/build';
 *
 * depotId({ appId: 480 }, 'linux'); // 483
 * ```
 */
export function depotId(
  options: Pick<SteamUploadOptions, 'appId' | 'depots'>,
  os: DesktopOs,
): number {
  const offset = { win: 1, mac: 2, linux: 3 }[os];
  return options.depots?.[OS_KEY[os]] ?? options.appId + offset;
}

function vdf(name: string, entries: Record<string, string | Record<string, string>>): string {
  const lines = [`"${name}"`, '{'];
  for (const [key, value] of Object.entries(entries)) {
    if (typeof value === 'string') lines.push(`\t"${key}" "${value.replace(/"/g, '\\"')}"`);
    else {
      lines.push(`\t"${key}"`, '\t{');
      for (const [k, v] of Object.entries(value))
        lines.push(`\t\t"${k}" "${v.replace(/"/g, '\\"')}"`);
      lines.push('\t}');
    }
  }
  lines.push('}', '');
  return lines.join('\n');
}

/**
 * Writes `scripts/app_build_<appId>.vdf` and one `depot_build_<depotId>.vdf` per OS in `steamDir`.
 *
 * @returns The app build script path.
 *
 * @example
 * ```ts
 * import { writeSteamScripts } from '@blacklight/native/build';
 *
 * const script = writeSteamScripts({
 *   appId: 480,
 *   steamDir: 'release/steam',
 *   oses: ['win', 'linux'],
 *   description: 'v1.2.0',
 * });
 * ```
 */
export function writeSteamScripts(options: SteamUploadOptions): string {
  const scripts = join(options.steamDir, 'scripts');
  mkdirSync(scripts, { recursive: true });
  const depots: Record<string, string> = {};
  for (const os of options.oses) {
    const id = depotId(options, os);
    const file = `depot_build_${id}.vdf`;
    depots[String(id)] = file;
    writeFileSync(
      join(scripts, file),
      vdf('DepotBuildConfig', {
        DepotID: String(id),
        ContentRoot: `../content/${os}/`,
        FileMapping: { LocalPath: '*', DepotPath: '.', recursive: '1' },
        FileExclusion: '*.pdb',
      }),
    );
  }
  const app = join(scripts, `app_build_${options.appId}.vdf`);
  writeFileSync(
    app,
    vdf('AppBuild', {
      AppID: String(options.appId),
      Desc: options.description,
      BuildOutput: '../output/',
      ContentRoot: '../content/',
      SetLive: options.branch ?? '',
      Preview: '0',
      Depots: depots,
    }),
  );
  return app;
}

/**
 * The steamcmd command that uploads the build. `STEAM_USERNAME` must hold a builder account
 * (Steam Guard is answered once, then steamcmd remembers the machine). In dry-run mode the app
 * build runs with `Preview "1"`: steamcmd checks the files and writes the manifests, nothing is
 * uploaded.
 *
 * @example
 * ```ts
 * import { spawnSync } from 'node:child_process';
 * import { steamUploadCommand } from '@blacklight/native/build';
 *
 * const { command, args, display } = steamUploadCommand(script, { dryRun: true });
 * console.log(display);
 * spawnSync(command, args, { stdio: 'inherit' });
 * ```
 */
export function steamUploadCommand(
  appBuild: string,
  options: { username?: string; dryRun?: boolean; cwd?: string } = {},
): {
  /** Executable to run (`steamcmd`). */
  command: string;
  /** Its arguments. */
  args: string[];
  /** The command line, for logs and instructions. */
  display: string;
} {
  const script = options.cwd ? relative(options.cwd, appBuild) : appBuild;
  const args = [
    '+login',
    options.username ?? '$STEAM_USERNAME',
    '+run_app_build',
    ...(options.dryRun ? ['-preview'] : []),
    script,
    '+quit',
  ];
  return { command: 'steamcmd', args, display: `steamcmd ${args.join(' ')}` };
}
