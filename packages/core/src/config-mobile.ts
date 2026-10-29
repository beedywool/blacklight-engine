/**
 * Android and iOS options of `game.config.ts`, used by `@blacklight/mobile` and by
 * `blacklight build --target android|ios`.
 *
 * @example
 * ```ts
 * mobile: { orientation: 'landscape', statusBar: 'hidden', keepAwake: true }
 * ```
 */
export interface MobileConfig {
  /**
   * Screen orientation, locked in the native project. `any` follows the device.
   * @defaultValue `'landscape'` when `resolution.width >= resolution.height`, else `'portrait'`
   */
  orientation?: 'landscape' | 'portrait' | 'any';
  /** System bars (status bar, Android navigation bar). @defaultValue `'hidden'` */
  statusBar?: 'hidden' | 'visible';
  /** Keep the screen on while the game is in the foreground. @defaultValue `true` */
  keepAwake?: boolean;
  /**
   * Google Play Games Services project id (Play Console → Play Games Services → Configuration),
   * a number written as a string. Enables the `playgames` native module on Android.
   */
  playGamesAppId?: string;
  /** Adds the Game Center capability to the iOS project (`gamecenter` module). @defaultValue `false` */
  gameCenter?: boolean;
}

const ORIENTATIONS = ['landscape', 'portrait', 'any'];

/** Validates `mobile` and appends one readable line per problem to `issues`. */
export function checkMobileConfig(value: unknown, issues: string[]): void {
  if (value === undefined) return;
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    issues.push('`mobile` must be an object, e.g. `mobile: { orientation: "landscape" }`');
    return;
  }
  const { orientation, statusBar, keepAwake, playGamesAppId, gameCenter } = value as Record<
    string,
    unknown
  >;
  if (orientation !== undefined && !ORIENTATIONS.includes(orientation as string)) {
    issues.push('`mobile.orientation` must be "landscape", "portrait" or "any"');
  }
  if (statusBar !== undefined && statusBar !== 'hidden' && statusBar !== 'visible') {
    issues.push('`mobile.statusBar` must be "hidden" or "visible"');
  }
  if (keepAwake !== undefined && typeof keepAwake !== 'boolean') {
    issues.push('`mobile.keepAwake` must be a boolean');
  }
  if (
    playGamesAppId !== undefined &&
    (typeof playGamesAppId !== 'string' || !/^\d+$/.test(playGamesAppId))
  ) {
    issues.push(
      '`mobile.playGamesAppId` must be the numeric project id as a string, e.g. "123456789012" (Play Console → Play Games Services → Configuration)',
    );
  }
  if (gameCenter !== undefined && typeof gameCenter !== 'boolean') {
    issues.push('`mobile.gameCenter` must be a boolean');
  }
}
