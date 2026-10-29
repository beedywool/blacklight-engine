import type { TargetOptions } from './index';

/** Options every target runner receives (`blacklight run --target <target>`). */
export interface RunOptions extends TargetOptions {
  /** Device or emulator id (`--device`); the runner picks one when omitted. */
  device?: string;
  /** Port of the dev server, for targets that load the game from it. */
  port?: number;
}

/** Builds (when needed), installs and starts a game on a device, emulator or window. */
export type TargetRunner = (options: RunOptions) => Promise<void>;

/**
 * Runners by target name, next to the `targets` build registry. `web` is handled by the run
 * command itself (dev server + browser); platform areas add theirs from their own files:
 *
 * @example
 * ```ts
 * // packages/cli/src/targets/mobile.ts
 * import { runners } from './runners';
 * runners.android = async ({ root, device }) => {
 *   // build, install with adb, start the activity on `device`
 * };
 * ```
 */
export const runners: Record<string, TargetRunner> = {};
