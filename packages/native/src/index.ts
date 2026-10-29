// `@blacklight/native`: the game side of the desktop app. The CLI adds `desktop()` to the plugins of
// desktop builds; the other exports work on every target (they do nothing outside the desktop app).
import type { Game } from '@blacklight/core';
import { DesktopPlatform } from './renderer/platform';
import { useSdlGamepads } from './renderer/gamepads';

export { DesktopPlatform } from './renderer/platform';
export { SdlGamepads, gamepad, type DesktopGamepad, type LedColor } from './renderer/gamepads';
export {
  discord,
  isFullscreen,
  setFullscreen,
  steam,
  type DiscordActivity,
  type DiscordPresence,
  type DiscordUser,
  type SteamOverlayDialog,
  type SteamServices,
} from './renderer/services';
export type { NativeBridge, NativeInfo, SdlPadState } from './bridge';
export {
  defineNative,
  fn,
  isNativeModule,
  type AnyNativeFunction,
  type ArgSchema,
  type NativeContext,
  type NativeFunction,
  type NativeModule,
  type NativeOptions,
} from './define-native';

/**
 * Game plugin of the desktop app: replaces `game.platform` with {@link DesktopPlatform}, reads
 * gamepads through SDL, and reports developer tools opened in a release build as tampering. Does
 * nothing outside the desktop app, so a web build that includes it still runs.
 *
 * @example
 * ```ts
 * await createGame(config, { scenes, mount, plugins: [desktop()] });
 * ```
 */
export function desktop(): (game: Game) => Promise<void> {
  return async (game) => {
    const bridge = globalThis.window?.blacklightNative;
    if (!bridge) return;
    game.platform = new DesktopPlatform(bridge);
    await useSdlGamepads(game);
    game.platform.on('security:devtools', () =>
      game.security.tamper({ kind: 'devtools', restore: () => undefined }),
    );
  };
}
