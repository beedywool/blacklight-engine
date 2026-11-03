import {
  createApp,
  defineAsyncComponent,
  markRaw,
  reactive,
  shallowReactive,
  shallowRef,
  watch,
  type App,
  type Component,
} from 'vue';
import {
  EventBus,
  type Game,
  type Scene,
  type SceneUi,
  type UiHost,
  type Viewport,
} from '@blacklight/core';
import { accessibility, applyColorFilter, bindAccessibility } from './a11y';
import { FocusManager, type FocusSound } from './focus';
import { FxLayer } from './fx/fx-layer';
import { I18n, setCurrentI18n, t } from './i18n';
import { BUILTIN_MESSAGES } from './messages';
import {
  coverTransition,
  createCover,
  effectNames,
  getEffect,
  onTransitionDefined,
  playEffect,
} from './transitions';
import { directionOf, type Direction } from './spatial';
import { activeTheme, defineTheme, getTheme, resolveTheme, type Theme } from './theme';
import UiRoot from './components/UiRoot.vue';
import ConfirmDialog from './widgets/ConfirmDialog.vue';

/** How a screen is shown. */
export interface ScreenOptions {
  /** Enter transition name. @defaultValue `'fade'` (`'zoom'` for modals) */
  enter?: string;
  /** Leave transition name. @defaultValue `'fade'` */
  leave?: string;
  /** Dims what is below, traps focus and blocks game input. */
  modal?: boolean;
  /** Game code reads input as idle while the screen is open. Default: on for `push` and modals. */
  blockInput?: boolean;
  /** The `back` action closes the screen. Default: on for `push` and modals. */
  closeOnBack?: boolean;
}

/**
 * An open screen, as the runtime keeps it. Read it through `useScreen().entry` or
 * `runtime.entries`; open and close screens through a {@link UiStack} instead of changing it.
 */
export interface ScreenEntry {
  /** Unique number, in opening order. */
  readonly id: number;
  /** The Vue component shown. */
  readonly component: Component;
  /** Props passed to the component; reactive, changes re-render the screen. */
  props: Record<string, unknown>;
  /** Scene the screen belongs to, `null` for global screens. */
  readonly owner: Scene<never> | null;
  /** How it was opened: `open` (over the others), `push` (hides those below) or `modal`. */
  readonly mode: 'open' | 'push' | 'modal';
  /** Enter transition name. */
  enter: string;
  /** Leave transition name, read when the screen closes. */
  leave: string;
  /** Game code reads input as idle while the screen is open. */
  blockInput: boolean;
  /** The `back` action closes the screen. */
  closeOnBack: boolean;
  /** `true` while the leave transition plays. */
  closing: boolean;
  /** Handlers for the `back` action; returning `true` consumes it. */
  readonly backHandlers: Set<() => boolean | void>;
  /** Root element of the screen once mounted, `null` before. */
  element: HTMLElement | null;
  /** @internal Settles the opener's promise; close screens with {@link ScreenHandle.close}. */
  resolve(result: unknown): void;
}

/** Returned by `open`, `push`, `replace` and `modal`. */
export interface ScreenHandle<R = unknown> {
  /** Id of the screen's {@link ScreenEntry}. */
  readonly id: number;
  /** Closes the screen; `result` resolves `result`. */
  close(result?: R): void;
  /** Resolves when the screen closes. */
  readonly result: Promise<R | undefined>;
}

/**
 * A screen to show: a Vue component, or the name of a screen file found by the CLI (`'Pause'` for
 * `ui/Pause.vue`, `'battle:Hud'` for the scene-local `scenes/battle/ui/Hud.vue`).
 */
export type ScreenRef = Component | string;

const UI_SCALE_SETTING = 'ui.scale';
const clampScale = (value: number) => Math.min(1.5, Math.max(0.75, value));
const UI_THEME_SETTING = 'ui.theme';

/**
 * The screens of one owner (a scene, or the game for global screens). Scenes reach theirs as
 * `this.ui`; Vue components through `useUi()`. A scene's screens are removed when the scene stops;
 * global ones (`uiOf(game).global`) survive scene changes.
 *
 * @example
 * ```ts
 * import { Scene } from '@blacklight/core';
 *
 * export class Battle extends Scene {
 *   create() {
 *     this.ui.open('Hud');
 *   }
 *   async quit() {
 *     if (await this.ui.confirm({ message: 'Leave the battle?', danger: true })) this.goto('title');
 *   }
 * }
 * ```
 */
export class UiStack implements SceneUi {
  constructor(
    private readonly runtime: UiRuntime,
    private readonly owner: Scene<never> | null,
  ) {}

  /** Shows a screen over the others (HUD, notifications). Focus moves to it if it has focusable elements. */
  open<R = unknown>(
    screen: ScreenRef,
    props: Record<string, unknown> = {},
    options: ScreenOptions = {},
  ): ScreenHandle<R> {
    return this.runtime.add<R>(screen, props, options, this.owner, 'open');
  }

  /** Shows a screen and hides the ones below until it closes (menus, submenus). */
  push<R = unknown>(
    screen: ScreenRef,
    props: Record<string, unknown> = {},
    options: ScreenOptions = {},
  ): ScreenHandle<R> {
    return this.runtime.add<R>(screen, props, options, this.owner, 'push');
  }

  /** Shows a modal screen and waits for its result (dialogs). */
  modal<R = unknown>(
    screen: ScreenRef,
    props: Record<string, unknown> = {},
    options: ScreenOptions = {},
  ): Promise<R | undefined> {
    return this.runtime.add<R>(screen, props, { ...options, modal: true }, this.owner, 'modal')
      .result;
  }

  /** Closes the top menu (pushed or modal screen) of this owner; HUDs opened with `open` stay. */
  pop(result?: unknown): void {
    const top = this.runtime.entries
      .filter((e) => e.owner === this.owner && !e.closing && e.mode !== 'open')
      .at(-1);
    if (top) this.runtime.close(top, result);
  }

  /** Closes the top screen of this owner and pushes another one. */
  replace<R = unknown>(
    screen: ScreenRef,
    props: Record<string, unknown> = {},
    options: ScreenOptions = {},
  ): ScreenHandle<R> {
    this.pop();
    return this.push<R>(screen, props, options);
  }

  /** Closes every screen of this owner. */
  closeAll(): void {
    for (const entry of this.runtime.entries.filter((e) => e.owner === this.owner))
      this.runtime.close(entry);
  }

  /** Asks a yes/no question in a modal dialog. */
  confirm(options: {
    title?: string;
    message: string;
    confirm?: string;
    cancel?: string;
    danger?: boolean;
  }): Promise<boolean> {
    return this.modal<boolean>(ConfirmDialog, options).then((result) => result === true);
  }
}

/** Installation options of {@link ui}. */
export interface UiOptions {
  /** Screen components by project path, from `import.meta.glob` (the CLI passes `ui/**` and `scenes/*\/ui/**`). */
  screens?: Record<string, () => Promise<unknown>>;
  /** Theme name. @defaultValue the saved setting, else `ui.theme` of the config, else `'blacklight'` */
  theme?: string;
  /** Themes to register before the layer starts (a saved custom theme must exist at startup). */
  themes?: Theme[];
  /** Starting language. @defaultValue the saved choice, else the browser's, else `locales.default` */
  locale?: string;
}

/**
 * The UI layer of a game: a Vue app over the canvas, the screen stacks, focus, input, themes,
 * translations and screen effects. The {@link ui} plugin creates one per game; reach it with
 * `uiOf(game)` in game code and `useUiRuntime()` in components.
 *
 * @example
 * ```ts
 * import { uiOf } from '@blacklight/ui';
 *
 * const runtime = uiOf(this.game);
 * runtime.theme = 'persona';
 * runtime.setScale(1.25);
 * runtime.global.open('Notifications');
 * ```
 */
export class UiRuntime implements UiHost {
  /** Open screens of every owner, in opening order. */
  readonly entries: ScreenEntry[] = shallowReactive([]);
  /** Root element of the layer, placed over the canvas in the game's mount. */
  readonly element: HTMLElement;
  /** Focus and spatial navigation of the screens (`current`, `focus`, `move`, `confirm`). */
  readonly focus: FocusManager;
  /** Player-adjustable UI scale (0.75–1.5), saved in settings. */
  readonly scale = shallowRef(1);
  /** Root transform: design area in CSS pixels of the mount. */
  readonly frame: {
    /** Left edge of the design area in CSS pixels of the mount. */
    x: number;
    /** Top edge of the design area in CSS pixels of the mount. */
    y: number;
    /** CSS pixels per virtual pixel. */
    scale: number;
    /** Design width in virtual pixels. */
    width: number;
    /** Design height in virtual pixels. */
    height: number;
    /**
     * Visible width past each side of the design area, in virtual pixels (`extend` mode on a
     * wider screen; 0 in `letterbox`). CSS reads it as `--bl-bleed-x`.
     */
    bleedX: number;
    /** Visible height past the top and the bottom of the design area (`--bl-bleed-y`). */
    bleedY: number;
  } = reactive({ x: 0, y: 0, scale: 1, width: 0, height: 0, bleedX: 0, bleedY: 0 });
  /** Safe area in virtual pixels (moves with notches and system bars). */
  readonly safeArea: {
    /** Left edge in virtual pixels (negative when it extends past the design area). */
    x: number;
    /** Top edge in virtual pixels. */
    y: number;
    /** Width in virtual pixels. */
    width: number;
    /** Height in virtual pixels. */
    height: number;
  } = reactive({ x: 0, y: 0, width: 0, height: 0 });
  /** The global screen stack: screens that survive scene changes. */
  readonly global: UiStack;
  private readonly app: App;
  private readonly stacks = new WeakMap<object, UiStack>();
  private readonly named = new Map<
    string,
    { path: string; component: Component; load: () => Promise<unknown>; loaded: boolean }
  >();
  /** Fires after the UI handled input, every step (and every frame while the game is paused). */
  readonly ticks = new EventBus<{
    /** The UI has read input for this step. */
    step: void;
  }>();
  /** Translations (`locales/<lang>.json`), current language and text direction. */
  readonly i18n: I18n;
  /** WebGL effects synchronized with the screens (UI-11). */
  readonly fx: FxLayer;
  /** The player's accessibility options (the same object as the `accessibility` export). */
  readonly accessibility = accessibility;
  /** Resolves once the starting language is loaded. */
  readonly ready: Promise<void>;
  private nextId = 1;
  /** Key repeat of directions: `held` ms of the current direction, next move at `next` ms. */
  private repeat = { direction: undefined as Direction | undefined, next: 0, held: 0 };
  private lastPoll = 0;

  constructor(
    /** The game the layer belongs to. */
    readonly game: Game,
    options: UiOptions = {},
  ) {
    this.global = new UiStack(this, null);
    for (const [path, loader] of Object.entries(options.screens ?? {})) {
      // One load shared by the runtime (which waits for it) and Vue's async component.
      let loading: Promise<unknown> | undefined;
      const load = () => (loading ??= loader());
      const name = path.slice(path.lastIndexOf('/') + 1).replace(/\.vue$/, '');
      const local = /scenes\/([^/]+)\/ui\//.exec(path)?.[1];
      const key = local ? `${local}:${name}` : name;
      const existing = this.named.get(key);
      if (existing) {
        console.warn(
          `[blacklight] Two screens are named "${key}": ${existing.path} and ${path}. ${path} is used.`,
        );
      }
      this.named.set(key, {
        path,
        load,
        loaded: false,
        component: markRaw(defineAsyncComponent(load as () => Promise<Component>)),
      });
    }
    for (const theme of options.themes ?? []) defineTheme(theme);
    bindAccessibility(game.settings);
    this.i18n = I18n.fromGame(game);
    this.i18n.add('en', BUILTIN_MESSAGES, { builtin: true });
    setCurrentI18n(this.i18n);
    this.ready =
      this.i18n.available.length > 0
        ? this.i18n
            .setLocale(options.locale ?? this.i18n.initialLocale(), { save: false })
            .catch((error: unknown) =>
              console.error('[blacklight] Could not load the language file:', error),
            )
        : Promise.resolve();
    this.scale.value = clampScale(
      game.settings.get<number>(UI_SCALE_SETTING) ?? game.config.ui?.scale ?? 1,
    );
    activeTheme.value =
      game.settings.get<string>(UI_THEME_SETTING) ??
      options.theme ??
      game.config.ui?.theme ??
      'blacklight';

    this.element = document.createElement('div');
    this.element.className = 'bl-ui-layer';
    Object.assign(this.element.style, {
      position: 'absolute',
      inset: '0',
      overflow: 'hidden',
      pointerEvents: 'none',
    });
    if (getComputedStyle(game.mount).position === 'static') game.mount.style.position = 'relative';
    game.mount.append(this.element);
    // Clicks and taps on screens never reach the canvas: report the device for prompts.
    this.element.addEventListener(
      'pointerdown',
      (event) => game.input.noteDevice(event.pointerType === 'touch' ? 'touch' : 'mouse'),
      { capture: true },
    );
    this.focus = new FocusManager(this.element, { sound: (kind) => this.sound(kind) });
    // Screen content can appear after the screen (async components, v-if): re-pick the focus scope.
    let queued = false;
    new MutationObserver(() => {
      if (queued) return;
      queued = true;
      queueMicrotask(() => {
        queued = false;
        this.updateScope();
      });
    }).observe(this.element, { childList: true, subtree: true });

    this.fx = new FxLayer(game, this.element);
    this.registerSceneTransitions();
    watch(
      () => accessibility.colorFilter,
      (filter) => applyColorFilter(game.mount, filter),
      { immediate: true },
    );

    this.app = createApp(UiRoot, { runtime: this });
    this.app.config.globalProperties.$t = t;
    this.app.provide('blacklight:ui', this);
    this.app.provide('blacklight:game', game);
    this.app.mount(this.element);

    game.events.on('resize', ({ viewport }) => this.layout(viewport));
    if (game.viewport) this.layout(game.viewport);
    // The UI reads input every step; while the game is paused no step runs, so it polls itself.
    game.events.on('step', () => this.handleInput());
    game.events.on('frame', () => {
      if (!game.paused) return;
      game.input.update();
      this.handleInput();
    });
  }

  private registerSceneTransitions(): void {
    const transitions = (this.game as Partial<Game>).transitions;
    if (!transitions) return;
    const register = (name: string) => {
      if (getEffect(name)) transitions.set(name, coverTransition(this.element, name));
    };
    for (const name of effectNames()) register(name);
    transitions.set('distort', this.fx.distortTransition());
    onTransitionDefined(register);
  }

  /**
   * Covers the screen with a transition effect, runs `during` (change the background, move the
   * camera), then reveals. For changes inside a scene; `goto` does the same between scenes.
   *
   * @example
   * ```ts
   * await uiOf(this.game).cover('ink', () => this.showBackground('night'));
   * ```
   */
  async cover(
    name: string,
    during: () => void | Promise<void>,
    options: { color?: string; duration?: number } = {},
  ): Promise<void> {
    const effect = getEffect(name);
    if (!effect) {
      throw new Error(`Unknown transition effect "${name}". Known: ${effectNames().join(', ')}.`);
    }
    const element = createCover(this.element, options.color);
    const seconds = options.duration === undefined ? undefined : options.duration / 1000;
    try {
      await playEffect(effect, element, 0, 1, 'in', true, seconds);
      element.style.visibility = 'visible';
      await during();
      await playEffect(effect, element, 1, 0, 'out', true, seconds);
    } finally {
      element.remove();
    }
  }

  /** Screens of a scene (`scene.ui`). */
  forScene(scene: Scene<never>): UiStack {
    let stack = this.stacks.get(scene);
    if (!stack) this.stacks.set(scene, (stack = new UiStack(this, scene)));
    return stack;
  }

  sceneEnded(scene: Scene<never>): void {
    for (const entry of this.entries.filter((e) => e.owner === scene)) this.remove(entry);
  }

  /** Current theme name; setting it switches themes live and saves the choice. */
  get theme(): string {
    return activeTheme.value;
  }
  set theme(name: string) {
    getTheme(name);
    activeTheme.value = name;
    this.game.settings.set(UI_THEME_SETTING, name);
  }

  /** Sets the player's UI scale, clamped to 0.75–1.5, and saves it in settings (`ui.scale`). */
  setScale(value: number): void {
    this.scale.value = clampScale(value);
    this.game.settings.set(UI_SCALE_SETTING, this.scale.value);
  }

  private resolveScreen(screen: string, owner: Scene<never> | null) {
    const found = (owner && this.named.get(`${owner.name}:${screen}`)) || this.named.get(screen);
    if (!found) {
      const known = [...this.named.keys()];
      throw new Error(
        `Unknown screen "${screen}". Screens are .vue files in ui/ or scenes/<scene>/ui/ (scene screens as "scene:Name"); known: ${known.join(', ') || 'none'}.`,
      );
    }
    return found;
  }

  /** @internal */
  add<R>(
    screen: ScreenRef,
    props: Record<string, unknown>,
    options: ScreenOptions,
    owner: Scene<never> | null,
    mode: ScreenEntry['mode'],
  ): ScreenHandle<R> {
    let resolve!: (value: unknown) => void;
    const result = new Promise<R | undefined>((r) => (resolve = r as (value: unknown) => void));
    if (options.modal) mode = 'modal';
    const menu = mode !== 'open';
    const named = typeof screen === 'string' ? this.resolveScreen(screen, owner) : undefined;
    const entry: ScreenEntry = reactive({
      id: this.nextId++,
      component: named ? named.component : (markRaw(screen as object) as Component),
      props,
      owner: owner ? markRaw(owner) : null,
      mode,
      enter: options.enter ?? (mode === 'modal' ? 'zoom' : 'fade'),
      leave: options.leave ?? 'fade',
      blockInput: options.blockInput ?? menu,
      closeOnBack: options.closeOnBack ?? menu,
      closing: false,
      backHandlers: markRaw(new Set<() => boolean | void>()),
      element: null,
      resolve,
    }) as ScreenEntry;
    const show = () => {
      if (entry.closing) return;
      this.entries.push(entry);
      this.update();
    };
    // A named screen loads first, so it enters with its content (and its useScreen() settings).
    if (named && !named.loaded) {
      void named.load().then(() => {
        named.loaded = true;
        show();
      });
    } else {
      show();
    }
    return { id: entry.id, close: (value?: R) => this.close(entry, value), result };
  }

  /** @internal Starts closing (the leave transition removes it). */
  close(entry: ScreenEntry, result?: unknown): void {
    if (entry.closing) return;
    entry.closing = true;
    entry.resolve(result);
    if (!entry.element) this.remove(entry);
    this.update();
  }

  /** @internal Removes a screen once its leave transition ended. */
  remove(entry: ScreenEntry): void {
    const index = this.entries.indexOf(entry);
    if (index < 0) return;
    if (!entry.closing) entry.resolve(undefined);
    this.entries.splice(index, 1);
    this.update();
  }

  /** Screens in drawing order: scene screens, then global ones, each by opening order. */
  get ordered(): ScreenEntry[] {
    return [...this.entries].sort(
      (a, b) => Number(a.owner === null) - Number(b.owner === null) || a.id - b.id,
    );
  }

  /** `true` for screens under a `push` or a modal: not interactive (and hidden under a push). */
  covered(entry: ScreenEntry): 'visible' | 'inert' | 'hidden' {
    const list = this.ordered.filter((e) => !e.closing);
    const index = list.indexOf(entry);
    const above = list.slice(index + 1);
    if (above.some((e) => e.mode === 'push')) return 'hidden';
    if (above.some((e) => e.mode === 'modal')) return 'inert';
    return 'visible';
  }

  /** @internal Recomputes focus scope and input blocking after the stack changed. */
  update(): void {
    this.game.input.blocked = this.entries.some((e) => e.blockInput && !e.closing);
    queueMicrotask(() => this.updateScope());
  }

  /** @internal Focus goes to the top screen that has something to focus. */
  updateScope(): void {
    const list = this.ordered.filter((e) => !e.closing && e.element);
    const top = [...list]
      .reverse()
      .find(
        (e) =>
          e.mode !== 'open' ||
          this.focus.focusables(e.element).length > 0 ||
          e.element!.querySelector('[data-bl-focus]'),
      );
    this.focus.setScope(top?.element ?? null);
  }

  /** The screen that receives `back`. */
  get top(): ScreenEntry | undefined {
    const scope = this.focus.current.value?.closest<HTMLElement>('[data-bl-screen]');
    // Only rendered screens count: one opened during this step does not take this step's input.
    return (
      this.entries.find((e) => e.element === scope && !e.closing) ??
      this.ordered.filter((e) => !e.closing && e.mode !== 'open' && e.element).at(-1)
    );
  }

  private layout(viewport: Viewport): void {
    const canvas = this.game.app.canvas.getBoundingClientRect();
    const mount = this.game.mount.getBoundingClientRect();
    const left = canvas.left - mount.left;
    const top = canvas.top - mount.top;
    // Screens bleed past the design area (skewed bands, `inset: -20%`): the game's canvas is where
    // they may show. A letterboxed canvas is smaller than the mount, and its bars stay black.
    const right = Math.max(0, mount.width - left - canvas.width);
    const bottom = Math.max(0, mount.height - top - canvas.height);
    this.element.style.clipPath =
      left > 0.5 || top > 0.5 || right > 0.5 || bottom > 0.5
        ? `inset(${top}px ${right}px ${bottom}px ${left}px)`
        : '';
    this.frame.x = left + viewport.originX;
    this.frame.y = top + viewport.originY;
    this.frame.scale = viewport.scale;
    this.frame.width = this.game.config.resolution.width;
    this.frame.height = this.game.config.resolution.height;
    this.frame.bleedX = Math.max(0, (viewport.visibleWidth - this.frame.width) / 2);
    this.frame.bleedY = Math.max(0, (viewport.visibleHeight - this.frame.height) / 2);
    Object.assign(this.safeArea, this.game.safeArea);
  }

  /** Plays a theme UI sound if the theme names one and the file is loaded. */
  sound(kind: FocusSound): void {
    const key = resolveTheme().sounds?.[kind];
    if (!key) return;
    try {
      this.game.audio.play(key, { bus: 'ui' });
    } catch {
      // Not loaded: menus stay silent rather than failing.
    }
  }

  private handleInput(): void {
    const players = this.game.input.joinedPlayers.map((p) => this.game.input.uiPlayer(p.number));
    const any = (test: (p: (typeof players)[number]) => boolean) => players.some(test);
    const target = this.focus.current.value;
    // Typing in a text field: left/right move the caret and Enter submits; up/down and back still
    // leave the field. Gamepads navigate as usual.
    const typing =
      !!target &&
      /^(INPUT|TEXTAREA)$/.test(target.tagName) &&
      this.game.input.lastDevice === 'keyboard';

    const x = typing
      ? 0
      : (any((p) => p.held('right')) ? 1 : 0) - (any((p) => p.held('left')) ? 1 : 0);
    const y = (any((p) => p.held('down')) ? 1 : 0) - (any((p) => p.held('up')) ? 1 : 0);
    const direction = directionOf(x, y);
    // Hold time counts polls, each worth at most 100 ms: a stalled frame (a chunk loading, a slow
    // device) must not turn a tap into a repeat.
    const now = performance.now();
    const elapsed = Math.min(100, Math.max(0, now - this.lastPoll));
    this.lastPoll = now;
    if (direction === this.repeat.direction) this.repeat.held += elapsed;
    if (
      direction &&
      (direction !== this.repeat.direction || this.repeat.held >= this.repeat.next)
    ) {
      const first = direction !== this.repeat.direction;
      this.repeat = first
        ? { direction, next: 380, held: 0 }
        : { direction, next: this.repeat.next + 90, held: this.repeat.held };
      let moved = this.focus.move(direction);
      if (!moved && direction.length > 5) {
        // Nothing diagonally: try each axis.
        moved =
          this.focus.move((direction.startsWith('up') ? 'up' : 'down') as Direction) ||
          this.focus.move((direction.endsWith('left') ? 'left' : 'right') as Direction);
      }
      if (!moved) this.sound('error');
    } else if (!direction) {
      this.repeat.direction = undefined;
    }

    if (!typing && any((p) => p.pressed('confirm'))) this.focus.confirm();
    if (any((p) => p.pressed('tabLeft'))) this.dispatch('bl-tab', -1);
    if (any((p) => p.pressed('tabRight'))) this.dispatch('bl-tab', 1);
    if (any((p) => p.pressed('back'))) this.back();
    this.ticks.emit('step');
  }

  private dispatch(name: string, detail: unknown): void {
    const scope = this.top?.element;
    scope?.dispatchEvent(new CustomEvent(name, { detail, bubbles: false }));
    for (const element of scope?.querySelectorAll('[data-bl-tabs]') ?? [])
      element.dispatchEvent(new CustomEvent(name, { detail }));
  }

  /** Runs the `back` action on the top screen: its handlers, else closing it. */
  back(): void {
    const top = this.top;
    if (!top) return;
    for (const handler of [...top.backHandlers].reverse()) {
      if (handler() === true) {
        this.sound('back');
        return;
      }
    }
    if (top.closeOnBack) {
      this.sound('back');
      this.close(top);
    }
  }

  /** Removes the layer. */
  destroy(): void {
    this.fx.destroy();
    this.app.unmount();
    this.element.remove();
  }
}

/**
 * Game plugin that installs the UI layer. The CLI adds it when the game depends on
 * `@blacklight/ui`; call it yourself with `createGame(config, { plugins: [ui()] })` otherwise.
 *
 * @example
 * ```ts
 * import { createGame } from '@blacklight/core';
 * import { ui } from '@blacklight/ui';
 *
 * const game = await createGame(config, {
 *   plugins: [ui({ screens: import.meta.glob('./ui/*.vue'), theme: 'persona' })],
 * });
 * ```
 */
export function ui(options: UiOptions = {}): (game: Game) => Promise<void> {
  return async (game) => {
    const runtime = new UiRuntime(game, options);
    game.ui = runtime;
    await runtime.ready;
  };
}

/**
 * The UI runtime of a game, for game code outside Vue components (components use
 * `useUiRuntime()`).
 *
 * @throws When `@blacklight/ui` is not installed on the game.
 *
 * @example
 * ```ts
 * import { uiOf } from '@blacklight/ui';
 *
 * await uiOf(this.game).cover('ink', () => this.showBackground('night'));
 * ```
 */
export function uiOf(game: Game): UiRuntime {
  if (!(game.ui instanceof UiRuntime))
    throw new Error('@blacklight/ui is not installed on this game.');
  return game.ui;
}
