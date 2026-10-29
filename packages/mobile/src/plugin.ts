import type { Game, MobileConfig } from '@blacklight/core';
import { MobilePlatform } from './platform';
import { capacitorPlugins, isNativeApp, type MobilePlugins } from './plugins';

/** `game.config.ts` `mobile` options with their defaults applied. */
export type ResolvedMobileConfig = Required<Omit<MobileConfig, 'playGamesAppId'>> &
  Pick<MobileConfig, 'playGamesAppId'>;

/**
 * Fills in the defaults of the `mobile` section: orientation from the design resolution, hidden
 * system bars, screen kept awake.
 *
 * @example
 * ```ts
 * resolveMobileConfig({ resolution: { width: 1080, height: 1920 } }).orientation; // 'portrait'
 * ```
 */
export function resolveMobileConfig(config: {
  resolution: { width: number; height: number };
  mobile?: MobileConfig;
}): ResolvedMobileConfig {
  const { mobile = {}, resolution } = config;
  return {
    orientation:
      mobile.orientation ?? (resolution.width >= resolution.height ? 'landscape' : 'portrait'),
    statusBar: mobile.statusBar ?? 'hidden',
    keepAwake: mobile.keepAwake ?? true,
    gameCenter: mobile.gameCenter ?? false,
    playGamesAppId: mobile.playGamesAppId,
  };
}

/** Options of the {@link mobile} plugin. */
export interface MobileOptions {
  /** Plugins to use instead of Capacitor's (tests). Installing with them works outside the app. */
  plugins?: MobilePlugins;
  /** How long a back button press holds the `back` action, in ms. @defaultValue `100` */
  backHold?: number;
}

/**
 * Presses `action` for player 1 the way a key tap does: down now, up `hold` ms later. The value
 * goes through `virtual`, so menus and game code see one `pressed` whatever the bindings.
 */
export function tapAction(game: Game, action: string, hold = 100): void {
  if (!game.input.hasAction(action)) return;
  const player = game.input.player(1);
  player.virtual.set(action, 1);
  setTimeout(() => {
    if (player.virtual.get(action) === 1) player.virtual.delete(action);
  }, hold);
}

/**
 * Game plugin that runs the game as an Android or iOS app: installs {@link MobilePlatform} as
 * `game.platform`, maps the Android back button to the `back` action, pauses the loop and audio
 * while the app is in the background, keeps the screen on and hides the system bars as
 * `game.config.ts` `mobile` asks. In a browser it does nothing, so the same bundle runs on the web.
 * `blacklight build --target android|ios` adds it to the game; games do not install it themselves.
 *
 * @example
 * ```ts
 * await createGame(config, { scenes, mount, plugins: [mobile()] });
 * ```
 */
export function mobile(options: MobileOptions = {}): (game: Game) => Promise<void> {
  return async (game) => {
    if (!options.plugins && !isNativeApp()) return;
    const plugins = options.plugins ?? capacitorPlugins();
    const platform = new MobilePlatform(plugins);
    const settings = resolveMobileConfig(game.config);
    platform.on('back', () => tapAction(game, 'back', options.backHold));
    // The WebView keeps running JavaScript for a moment in the background: blur stops the loop,
    // releases held keys and suspends audio, the same path as a hidden browser tab.
    platform.on('pause', () => globalThis.dispatchEvent?.(new Event('blur')));
    platform.on('resume', () => {
      globalThis.dispatchEvent?.(new Event('focus'));
      // Android shows the bars again after some system dialogs.
      if (settings.statusBar === 'hidden') void plugins.systemBars.hide().catch(() => {});
    });
    await platform.init();
    game.platform = platform;
    const startup: Promise<unknown>[] = [];
    if (settings.keepAwake) startup.push(plugins.keepAwake.keepAwake());
    if (settings.statusBar === 'hidden') startup.push(plugins.systemBars.hide());
    // Optional features: a device without them must still start the game.
    for (const result of await Promise.allSettled(startup)) {
      if (result.status === 'rejected') console.warn('@blacklight/mobile:', result.reason);
    }
  };
}
