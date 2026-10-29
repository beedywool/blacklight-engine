import {
  computed,
  inject,
  onBeforeUnmount,
  onMounted,
  shallowRef,
  type ComputedRef,
  type Ref,
} from 'vue';
import type { Filter } from 'pixi.js';
import type { Device, Game } from '@blacklight/core';
import { FOCUS_ATTR, GROUP_ATTR } from './focus';
import type { FxName } from './fx/filters';
import type { FxHandle, FxOptions } from './fx/fx-layer';
import { padFamily, type PadFamily } from './prompts';
import type { ScreenEntry, UiRuntime, UiStack } from './runtime';
import { Timeline } from './timeline';

/** The running game. */
export function useGame(): Game {
  const game = inject<Game>('blacklight:game');
  if (!game) throw new Error('useGame() works inside @blacklight/ui screens only.');
  return game;
}

/** The UI runtime (theme, scale, focus, global screens). */
export function useUiRuntime(): UiRuntime {
  const runtime = inject<UiRuntime>('blacklight:ui');
  if (!runtime) throw new Error('This composable works inside @blacklight/ui screens only.');
  return runtime;
}

/**
 * Screens of the current screen's scene (or global screens for global ones): open, push, pop,
 * modal, confirm.
 */
export function useUi(): UiStack {
  const runtime = useUiRuntime();
  const entry = inject<ScreenEntry | null>('blacklight:screen', null);
  return entry?.owner ? runtime.forScene(entry.owner) : runtime.global;
}

export interface UseScreenOptions {
  /** Enter transition (overrides the caller's). */
  enter?: string;
  /** Leave transition. */
  leave?: string;
  /** Called on the `back` action; return `true` to stop the screen from closing. */
  onBack?: () => boolean | void;
}

/**
 * The screen this component is shown in: close it with a result, react to `back`, know whether it
 * is on top.
 *
 * @example
 * ```ts
 * const screen = useScreen({ enter: 'slash', leave: 'fade' });
 * screen.close('resume');
 * ```
 */
export function useScreen(options: UseScreenOptions = {}) {
  const entry = inject<ScreenEntry | null>('blacklight:screen', null);
  const runtime = useUiRuntime();
  if (!entry) throw new Error('useScreen() must be called in a component opened as a screen.');
  if (options.enter) entry.enter = options.enter;
  if (options.leave) entry.leave = options.leave;
  if (options.onBack) {
    const handler = options.onBack;
    entry.backHandlers.add(handler);
    onBeforeUnmount(() => entry.backHandlers.delete(handler));
  }
  return {
    entry,
    /** Closes the screen, resolving its result. */
    close: (result?: unknown) => runtime.close(entry, result),
    /** `true` while no screen covers this one. */
    isTop: computed(() => runtime.covered(entry) === 'visible'),
    /** Scene of the screen, `null` for global screens. */
    scene: entry.owner,
  };
}

/**
 * Runs `callback` every time the UI reads input: every game step, and every frame while the game
 * is paused. With `onlyOnTop`, it runs only while this component's screen is not covered.
 */
export function onUiStep(callback: () => void, options: { onlyOnTop?: boolean } = {}): void {
  const runtime = useUiRuntime();
  const entry = inject<ScreenEntry | null>('blacklight:screen', null);
  const off = runtime.ticks.on('step', () => {
    if (options.onlyOnTop && entry && runtime.covered(entry) !== 'visible') return;
    callback();
  });
  onBeforeUnmount(off);
}

/** Last device used by a player (for prompts and layout tweaks), and its gamepad family. */
export function useInputDevice(player = 1): {
  device: Ref<Device>;
  family: ComputedRef<PadFamily>;
} {
  const game = useGame();
  const device = shallowRef<Device>(game.input.player(player).lastDevice);
  const pads = shallowRef(game.input.gamepads);
  const offs = [
    game.input.events.on('device', () => {
      device.value = game.input.player(player).lastDevice;
      pads.value = game.input.gamepads;
    }),
    game.input.events.on('gamepadconnected', () => (pads.value = game.input.gamepads)),
    // A player who joins with a pad uses it from now on, without a global device change.
    game.input.events.on('join', ({ player: joined }) => {
      if (joined === player) device.value = game.input.player(player).lastDevice;
    }),
  ];
  onBeforeUnmount(() => offs.forEach((off) => off()));
  // The family of this player's own pad (player 1 reads every pad until others join).
  const family = computed(() => {
    void device.value;
    const own = game.input.player(player).pads;
    const pad = own === 'any' ? pads.value[0] : pads.value.find((p) => own.has(p.index));
    return padFamily(pad ?? pads.value[0]);
  });
  return { device, family };
}

let groups = 0;

/**
 * A focus group over a list of items, returning the index of the focused one.
 *
 * @example
 * ```vue
 * <script setup>
 * const items = ['Resume', 'Items', 'Quit'];
 * const { focused, group, item } = useFocus(items, { wrap: true });
 * </script>
 * <template>
 *   <nav v-bind="group">
 *     <Skew v-for="(it, i) in items" :key="it" v-bind="item(i)" :active="focused === i">{{ it }}</Skew>
 *   </nav>
 * </template>
 * ```
 */
export function useFocus(
  items: readonly unknown[] | Ref<readonly unknown[]>,
  options: { wrap?: boolean; axis?: 'x' | 'y'; trap?: boolean } = {},
) {
  const runtime = useUiRuntime();
  const id = `g${++groups}`;
  const group = {
    [GROUP_ATTR]: [options.wrap ? 'wrap' : '', options.trap ? 'trap' : '', options.axis ?? '']
      .join(' ')
      .trim(),
    'data-bl-group-id': id,
  };
  const focused = computed(() => {
    const element = runtime.focus.current.value;
    if (!element || element.closest('[data-bl-group-id]')?.getAttribute('data-bl-group-id') !== id)
      return -1;
    return Number(element.getAttribute('data-bl-index') ?? -1);
  });
  void items;
  return {
    /** Index of the focused item, −1 when focus is elsewhere. */
    focused,
    /** Attributes for the group element. */
    group,
    /** Attributes for item `index`. */
    item: (index: number) => ({ [FOCUS_ATTR]: '', 'data-bl-index': index }),
    /** Focuses item `index`. */
    focus: (index: number) => {
      const element = runtime.element.querySelector<HTMLElement>(
        `[data-bl-group-id="${id}"] [data-bl-index="${index}"]`,
      );
      if (element) runtime.focus.focus(element);
    },
  };
}

/**
 * A timeline for this component, stopped when it unmounts.
 *
 * @param clock - `'ui'` (real time, runs while the game is paused) or `'game'` (pauses and slows with the game).
 */
export function useTimeline(clock: 'ui' | 'game' = 'ui'): Timeline {
  const game = inject<Game | undefined>('blacklight:game', undefined);
  const timeline = new Timeline(game, clock);
  onBeforeUnmount(() => timeline.stop('freeze'));
  return timeline;
}

/**
 * Adds an FX layer effect while this component is mounted: it fades in when the screen opens and
 * out when it closes (a blurred game behind a pause menu, a glitch behind a corrupted save screen).
 *
 * @example
 * ```ts
 * useFx('blur', { strength: 0.6, fade: 250 });
 * ```
 */
export function useFx(
  effect: FxName | Filter,
  options: FxOptions = {},
): { handle: FxHandle | undefined } {
  const runtime = useUiRuntime();
  const state: { handle: FxHandle | undefined } = { handle: undefined };
  onMounted(() => {
    state.handle = runtime.fx.add(effect, { fade: 250, ...options });
  });
  onBeforeUnmount(() => {
    void state.handle?.remove(options.fade ?? 200);
  });
  return state;
}
