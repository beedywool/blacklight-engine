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

/** Taps waiting for the one in progress to end, by player then action. */
const queued = new WeakMap<object, Map<string, number>>();

/**
 * Presses `action` for player 1 the way a key tap does: down now, up `hold` ms later (and not
 * before the game has read it). The value goes through `virtual`, so menus and game code see
 * one `pressed` whatever the bindings. A tap that comes while the previous one is still down waits
 * for it, then gets its own press after it has been up for a read: two quick back presses close
 * two menus. The mobile plugin uses it for the Android back button; on-screen buttons can use it
 * too.
 *
 * @example
 * ```ts
 * import { tapAction } from '@blacklight/mobile';
 *
 * pauseButton.addEventListener('pointerdown', () => tapAction(this.game, 'pause'));
 * ```
 */
export function tapAction(game: Game, action: string, hold = 100): void {
  if (!game.input.hasAction(action)) return;
  const player = game.input.player(1);
  let waiting = queued.get(player);
  if (!waiting) queued.set(player, (waiting = new Map()));
  const pending = waiting.get(action);
  if (pending !== undefined) {
    waiting.set(action, pending + 1);
    return;
  }
  // A slow frame can last longer than `hold`: the tap stays down until the input was read.
  const read = (since: number) => game.input.updates > since;
  const press = () => {
    player.virtual.set(action, 1);
    const since = game.input.updates;
    const release = () => {
      if (!read(since)) {
        setTimeout(release, 16);
        return;
      }
      player.virtual.delete(action);
      // Up until the input was read again (taps arriving meanwhile wait), and `hold` ms before the
      // next.
      const up = game.input.updates;
      const next = () => {
        if (!read(up)) {
          setTimeout(next, 16);
          return;
        }
        const left = waiting.get(action) ?? 0;
        if (left === 0) {
          waiting.delete(action);
          return;
        }
        waiting.set(action, left - 1);
        press();
      };
      setTimeout(next, (waiting.get(action) ?? 0) > 0 ? hold : 0);
    };
    setTimeout(release, hold);
  };
  waiting.set(action, 0);
  press();
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
