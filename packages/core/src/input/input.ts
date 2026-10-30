import { EventBus } from '../events';
import { clamp, Vector2, type Point } from '../math';
import type { ActionName } from '../register';
import { DEFAULT_ACTIONS, parseBinding, type Binding, type ParsedBinding } from './bindings';
import { GamepadReader, PAD_BUTTONS, type PadState } from './gamepad';

export type Device = 'keyboard' | 'mouse' | 'touch' | 'gamepad';

/** `input` in `game.config.ts`. */
export interface InputConfig {
  /** Action → bindings. Merged over the default actions (left, right, up, down, confirm, back, pause, jump, action). */
  actions?: Record<string, Binding[]>;
  /** Stick dead zone, 0–1. @defaultValue `0.2` */
  deadzone?: number;
}

export interface InputEvents {
  /** The player used another kind of device (to switch button prompts). */
  device: Device;
  gamepadconnected: { index: number; id: string };
  gamepaddisconnected: { index: number; id: string };
  /** Bindings changed (rebinding or reset). */
  bindings: { action: string | undefined };
  /** A new local player joined (see `input.join`). */
  join: { player: number; device: Device; pad?: number };
}

/** Pointer position in virtual pixels of the screen (not of the camera's world). */
export interface PointerState extends Point {
  /** A mouse button or a finger is down. */
  down: boolean;
  /** Went down during the last step. */
  pressed: boolean;
  /** Went up during the last step. */
  released: boolean;
  /** Last pointer type. */
  type: 'mouse' | 'touch' | 'pen';
}

interface ActionState {
  value: number;
  held: boolean;
  pressed: boolean;
  released: boolean;
}

const IDLE: ActionState = { value: 0, held: false, pressed: false, released: false };

/**
 * The input of one local player: the actions read from the devices assigned to that player.
 *
 * @example
 * ```ts
 * if (this.input.pressed('jump')) this.jump();
 * const move = this.input.vector('left', 'right', 'up', 'down');
 * ```
 */
export class PlayerInput {
  /** Joined players own devices; player 1 starts with every device. */
  joined = false;
  keyboard = false;
  mouse = false;
  touch = false;
  /** Gamepad indices, or `'any'` for every connected pad. */
  pads: Set<number> | 'any' = new Set();
  /** Last device this player used. */
  lastDevice: Device = 'keyboard';
  /** Values set by on-screen controls (virtual joystick, touch buttons), 0–1 by action. */
  readonly virtual = new Map<string, number>();
  private states = new Map<string, ActionState>();

  constructor(
    readonly number: number,
    private readonly manager: InputManager,
  ) {}

  /** Action went down during the last step. */
  pressed(action: ActionName): boolean {
    return this.state(action).pressed;
  }

  /** Action is down. */
  held(action: ActionName): boolean {
    return this.state(action).held;
  }

  /** Action went up during the last step. */
  released(action: ActionName): boolean {
    return this.state(action).released;
  }

  /** Analog value 0–1 (sticks, triggers); 0 or 1 for keys. */
  value(action: ActionName): number {
    return this.state(action).value;
  }

  /** −1 to 1 from two opposite actions: `axis('left', 'right')`. */
  axis(negative: ActionName, positive: ActionName): number {
    return this.value(positive) - this.value(negative);
  }

  /** Direction from four actions, length at most 1. */
  vector(left: ActionName, right: ActionName, up: ActionName, down: ActionName): Vector2 {
    return new Vector2(this.axis(left, right), this.axis(up, down)).limit(1);
  }

  /** Vibrates this player's gamepads. Strengths 0–1. */
  rumble(strong: number, weak = strong, duration = 200): void {
    for (const index of this.manager.padsOf(this)) {
      const pad = this.manager.rawPad(index);
      void pad?.vibrationActuator?.playEffect?.('dual-rumble', {
        startDelay: 0,
        duration,
        strongMagnitude: clamp(strong, 0, 1),
        weakMagnitude: clamp(weak, 0, 1),
      });
    }
  }

  private state(action: ActionName): ActionState {
    if (!this.manager.hasAction(action)) this.manager.unknownAction(action);
    if (this.manager.blocked && !this.ui) return IDLE;
    return this.source().stateMap.get(action) ?? IDLE;
  }

  /** Reads through the block of modal UI screens (the UI layer's own input). */
  protected readonly ui: boolean = false;

  /** Where states come from (UI views share the game player's states). */
  protected source(): PlayerInput {
    return this;
  }

  /** @internal */
  setStates(states: Map<string, ActionState>): void {
    this.states = states;
  }

  /** @internal */
  get stateMap(): Map<string, ActionState> {
    return this.states;
  }

  /** @internal */
  previous(action: string): ActionState {
    return this.states.get(action) ?? IDLE;
  }
}

/** A player's input as the UI layer sees it: not blocked by modal screens. */
class UiPlayerInput extends PlayerInput {
  protected override readonly ui = true;

  constructor(
    private readonly player: PlayerInput,
    manager: InputManager,
  ) {
    super(player.number, manager);
  }

  protected override source(): PlayerInput {
    return this.player;
  }
}

/** Settings key where rebinding is saved. */
const BINDINGS_SETTING = 'input.bindings';

/** Persists rebinding; the game passes its settings store. */
export interface InputSettings {
  get<T>(key: string): T | undefined;
  set(key: string, value: unknown): void;
}

/**
 * Keyboard, mouse, touch and gamepads mapped to named actions, for up to 8 local players.
 * Read through `this.input` in scenes and objects; state changes once per fixed step.
 */
export class InputManager {
  readonly events = new EventBus<InputEvents>();
  readonly players: PlayerInput[];
  readonly pointer: PointerState = {
    x: 0,
    y: 0,
    down: false,
    pressed: false,
    released: false,
    type: 'mouse',
  };
  /** Touch points in virtual screen pixels, by pointer id. */
  readonly touches = new Map<number, Point>();
  lastDevice: Device = 'keyboard';
  deadzone: number;
  /**
   * While `true` (a modal UI screen is open), game code reads every action as idle; the UI reads
   * through `uiPlayer()`.
   */
  blocked = false;
  private readonly uiPlayers = new Map<number, PlayerInput>();

  private bindings: Record<string, Binding[]>;
  private parsed = new Map<string, ParsedBinding[]>();
  private readonly defaults: Record<string, Binding[]>;
  private readonly keys = new Map<string, { down: boolean; presses: number }>();
  private readonly mouseButtons = new Map<number, { down: boolean; presses: number }>();
  private pointerPresses = 0;
  private pointerReleases = 0;
  private touchPresses = 0;
  private pads = new Map<number, PadState>();
  private readonly reader = new GamepadReader();
  private readonly warned = new Set<string>();
  private capture: ((binding: Binding) => void) | undefined;
  /** Pad buttons held at the end of the previous step and of this one. */
  private padsHeld = new Map<number, Set<number>>();
  private padsBefore = new Map<number, Set<number>>();

  constructor(
    config: InputConfig = {},
    private readonly settings?: InputSettings,
    /**
     * Where gamepads come from: the browser Gamepad API by default. The desktop app replaces it
     * with SDL pads read in the Electron main process, in the same shape.
     */
    public getGamepads: () => (Gamepad | null)[] = () =>
      typeof navigator !== 'undefined' && navigator.getGamepads ? [...navigator.getGamepads()] : [],
  ) {
    this.deadzone = config.deadzone ?? 0.2;
    this.defaults = { ...DEFAULT_ACTIONS, ...config.actions };
    this.bindings = {
      ...this.defaults,
      ...(settings?.get<Record<string, Binding[]>>(BINDINGS_SETTING) ?? {}),
    };
    this.reparse();
    this.players = Array.from({ length: 8 }, (_, i) => new PlayerInput(i + 1, this));
    const first = this.players[0]!;
    first.joined = first.keyboard = first.mouse = first.touch = true;
    first.pads = 'any';
  }

  private reparse(): void {
    this.parsed = new Map(
      Object.entries(this.bindings).map(([action, list]) => [action, list.map(parseBinding)]),
    );
  }

  /** Player `n` (1–8). */
  player(n = 1): PlayerInput {
    const player = this.players[n - 1];
    if (!player) throw new RangeError(`Player ${n} does not exist: local players go from 1 to 8.`);
    return player;
  }

  /** Input of player `n` for the UI layer: the same actions, never blocked. */
  uiPlayer(n = 1): PlayerInput {
    let view = this.uiPlayers.get(n);
    if (!view) this.uiPlayers.set(n, (view = new UiPlayerInput(this.player(n), this)));
    return view;
  }

  /** Players that have joined, player 1 first. */
  get joinedPlayers(): PlayerInput[] {
    return this.players.filter((p) => p.joined);
  }

  // Player 1 shortcuts.
  pressed(action: ActionName): boolean {
    return this.players[0]!.pressed(action);
  }
  held(action: ActionName): boolean {
    return this.players[0]!.held(action);
  }
  released(action: ActionName): boolean {
    return this.players[0]!.released(action);
  }
  value(action: ActionName): number {
    return this.players[0]!.value(action);
  }
  axis(negative: ActionName, positive: ActionName): number {
    return this.players[0]!.axis(negative, positive);
  }
  vector(left: ActionName, right: ActionName, up: ActionName, down: ActionName): Vector2 {
    return this.players[0]!.vector(left, right, up, down);
  }

  /** Current bindings of an action. */
  bindingsOf(action: ActionName): readonly Binding[] {
    return this.bindings[action] ?? [];
  }

  /** Every action name. */
  get actions(): string[] {
    return Object.keys(this.bindings);
  }

  hasAction(action: string): boolean {
    return action in this.bindings;
  }

  /** @internal */
  unknownAction(action: string): void {
    if (this.warned.has(action)) return;
    this.warned.add(action);
    console.warn(
      `[blacklight] Unknown input action "${action}". Add it to \`input.actions\` in game.config.ts.`,
    );
  }

  /** Replaces the bindings of an action and saves them with the settings. */
  rebind(action: ActionName, bindings: Binding[]): void {
    bindings.forEach(parseBinding);
    this.bindings[action] = [...bindings];
    this.reparse();
    this.saveBindings();
    this.events.emit('bindings', { action });
  }

  /** Restores the configured bindings of one action, or of all. */
  resetBindings(action?: ActionName): void {
    if (action) this.bindings[action] = [...(this.defaults[action] ?? [])];
    else this.bindings = { ...this.defaults };
    this.reparse();
    this.saveBindings();
    this.events.emit('bindings', { action });
  }

  private saveBindings(): void {
    const changed: Record<string, Binding[]> = {};
    for (const [action, list] of Object.entries(this.bindings)) {
      if (JSON.stringify(list) !== JSON.stringify(this.defaults[action])) changed[action] = list;
    }
    this.settings?.set(BINDINGS_SETTING, changed);
  }

  /**
   * Resolves with the next key, mouse button or pad button pressed (for a "press a key" screen).
   * Escape cancels with `undefined`.
   */
  captureBinding(): Promise<Binding | undefined> {
    return new Promise((resolve) => {
      this.capture = (binding) => {
        this.capture = undefined;
        resolve(binding === 'Escape' ? undefined : binding);
      };
    });
  }

  /**
   * Adds a local player when a device that no joined player owns presses `action` (`confirm`
   * by default). Call it every step on a join screen; returns the new player or `undefined`.
   */
  join(action: ActionName = 'confirm', max = 8): PlayerInput | undefined {
    const joined = this.joinedPlayers;
    if (joined.length >= max) return undefined;
    const owned = (pad: number) => joined.some((p) => p.pads !== 'any' && p.pads.has(pad));
    const solo = joined.length === 1 && joined[0]!.pads === 'any';
    const list = this.parsed.get(action) ?? [];
    for (const [index, pad] of this.pads) {
      if (owned(index) || (solo && this.lastPadOfFirst === index)) continue;
      const wasHeld = this.padsBefore.get(index) ?? new Set();
      const pressed = list.some(
        (b) =>
          b.device === 'gamepad' &&
          'button' in b &&
          pad.buttons[b.button]! > 0.5 &&
          !wasHeld.has(b.button),
      );
      if (!pressed) continue;
      if (solo) {
        // Player 1 keeps the keyboard and the pad it used last; the others become free.
        const first = joined[0]!;
        first.pads = this.lastPadOfFirst === undefined ? new Set() : new Set([this.lastPadOfFirst]);
      }
      const player = this.players.find((p) => !p.joined)!;
      player.joined = true;
      player.pads = new Set([index]);
      player.lastDevice = 'gamepad';
      this.events.emit('join', { player: player.number, device: 'gamepad', pad: index });
      return player;
    }
    return undefined;
  }

  /** Gives a gamepad to a player (removing it from others). */
  assignPad(player: number, pad: number): void {
    for (const p of this.players) if (p.pads !== 'any') p.pads.delete(pad);
    const target = this.player(player);
    if (target.pads === 'any') target.pads = new Set();
    target.pads.add(pad);
    target.joined = true;
  }

  /** Removes a player and frees its devices (player 1 cannot leave). */
  leave(player: number): void {
    if (player === 1) return;
    const target = this.player(player);
    target.joined = false;
    target.pads = new Set();
    target.keyboard = target.mouse = target.touch = false;
  }

  private lastPadOfFirst: number | undefined;

  /** @internal Pad indices a player reads. */
  padsOf(player: PlayerInput): number[] {
    return player.pads === 'any'
      ? [...this.pads.keys()]
      : [...player.pads].filter((i) => this.pads.has(i));
  }

  /** @internal */
  rawPad(index: number): Gamepad | undefined {
    return this.getGamepads().find((p) => p?.index === index) ?? undefined;
  }

  // Device events, called by the DOM listeners (or by tests).

  keyDown(code: string, repeat = false): void {
    if (this.capture && !repeat) return this.capture(code);
    const key = this.keys.get(code) ?? { down: false, presses: 0 };
    if (!key.down && !repeat) key.presses++;
    key.down = true;
    this.keys.set(code, key);
    this.setDevice('keyboard');
  }

  keyUp(code: string): void {
    const key = this.keys.get(code);
    if (key) key.down = false;
  }

  /** Releases every key (window lost focus: keyup events would be missed). */
  releaseAll(): void {
    for (const key of this.keys.values()) key.down = false;
    for (const button of this.mouseButtons.values()) button.down = false;
    this.pointer.down = false;
    this.touches.clear();
  }

  pointerDown(id: number, type: PointerState['type'], button: number, at: Point): void {
    if (this.capture && type === 'mouse') {
      this.capture(`Mouse:${['Left', 'Middle', 'Right', 'Back', 'Forward'][button] ?? 'Left'}`);
      return;
    }
    this.pointerMove(id, type, at);
    this.pointer.down = true;
    this.pointerPresses++;
    if (type === 'touch') {
      this.touches.set(id, { ...at });
      this.touchPresses++;
      this.setDevice('touch');
    } else {
      const state = this.mouseButtons.get(button) ?? { down: false, presses: 0 };
      state.down = true;
      state.presses++;
      this.mouseButtons.set(button, state);
      this.setDevice('mouse');
    }
  }

  pointerUp(id: number, type: PointerState['type'], button: number, at: Point): void {
    this.pointerMove(id, type, at);
    if (type === 'touch') this.touches.delete(id);
    else {
      const state = this.mouseButtons.get(button);
      if (state) state.down = false;
    }
    this.pointer.down =
      this.touches.size > 0 || [...this.mouseButtons.values()].some((b) => b.down);
    this.pointerReleases++;
  }

  pointerMove(id: number, type: PointerState['type'], at: Point): void {
    this.pointer.x = at.x;
    this.pointer.y = at.y;
    this.pointer.type = type;
    if (type === 'touch' && this.touches.has(id)) this.touches.set(id, { ...at });
  }

  /** Records that a device was used (the UI layer reports clicks and taps on its screens). */
  noteDevice(device: Device, player = this.players[0]!): void {
    this.setDevice(device, player);
  }

  private setDevice(device: Device, player = this.players[0]!): void {
    player.lastDevice = device;
    if (device !== this.lastDevice) {
      this.lastDevice = device;
      this.events.emit('device', device);
    }
  }

  /**
   * Input reads so far: one per fixed step, and one per frame while the game is paused (the UI
   * keeps reading). Code that injects input (`virtual`) waits for it to change before lifting a
   * press, so a slow frame cannot swallow the press.
   */
  get updates(): number {
    return this.updateCount;
  }
  private updateCount = 0;

  /** @internal Called once per fixed step, before game logic. */
  update(): void {
    this.updateCount++;
    this.padsBefore = this.padsHeld;
    this.pollPads();
    this.pointer.pressed = this.pointerPresses > 0;
    this.pointer.released = this.pointerReleases > 0;
    this.pointerPresses = this.pointerReleases = 0;

    for (const player of this.players) {
      if (!player.joined) continue;
      const states = new Map<string, ActionState>();
      for (const [action, bindings] of this.parsed) {
        let value = 0;
        let presses = 0;
        for (const binding of bindings) {
          const [v, p] = this.read(binding, player);
          value = Math.max(value, v);
          presses += p;
        }
        value = Math.max(value, player.virtual.get(action) ?? 0);
        const before = player.previous(action);
        const held = value >= 0.5 || presses > 0;
        states.set(action, {
          // A key tapped between two steps counts as fully pressed for one step.
          value: held && value === 0 ? 1 : value,
          held,
          pressed: (held && !before.held) || presses > 0,
          released: !held && before.held,
        });
      }
      player.setStates(states);
    }

    for (const key of this.keys.values()) key.presses = 0;
    for (const button of this.mouseButtons.values()) button.presses = 0;
    this.touchPresses = 0;
    this.padsHeld = new Map(
      [...this.pads].map(([index, pad]) => [
        index,
        new Set(pad.buttons.flatMap((v, i) => (v > 0.5 ? [i] : []))),
      ]),
    );
  }

  /** Value (0–1) and presses since the last step of one binding for one player. */
  private read(binding: ParsedBinding, player: PlayerInput): [number, number] {
    switch (binding.device) {
      case 'keyboard': {
        if (!player.keyboard) return [0, 0];
        const key = this.keys.get(binding.code);
        return key ? [key.down ? 1 : 0, key.presses] : [0, 0];
      }
      case 'mouse': {
        if (!player.mouse) return [0, 0];
        const state = this.mouseButtons.get(binding.button);
        return state ? [state.down ? 1 : 0, state.presses] : [0, 0];
      }
      case 'touch':
        return player.touch ? [this.touches.size > 0 ? 1 : 0, this.touchPresses] : [0, 0];
      case 'gamepad': {
        let value = 0;
        for (const index of this.padsOf(player)) {
          const pad = this.pads.get(index)!;
          if ('button' in binding) value = Math.max(value, pad.buttons[binding.button] ?? 0);
          else {
            const raw = (pad.axes[binding.axis] ?? 0) * binding.sign;
            value = Math.max(
              value,
              raw > this.deadzone ? (raw - this.deadzone) / (1 - this.deadzone) : 0,
            );
          }
        }
        return [value, 0];
      }
    }
  }

  private pollPads(): void {
    const seen = new Set<number>();
    for (const raw of this.getGamepads()) {
      if (!raw || !raw.connected) continue;
      seen.add(raw.index);
      const pad = this.reader.read(raw);
      if (!this.pads.has(raw.index))
        this.events.emit('gamepadconnected', { index: raw.index, id: raw.id });
      this.pads.set(raw.index, pad);
      const active = pad.buttons.some((v) => v > 0.5) || pad.axes.some((v) => Math.abs(v) > 0.5);
      if (active) {
        const owner = this.players.find(
          (p) => p.joined && (p.pads === 'any' || p.pads.has(raw.index)),
        );
        if (owner) this.setDevice('gamepad', owner);
        // Player 1's pad is the first one it used; other pads may join as new players.
        if (
          owner?.number === 1 &&
          (this.lastPadOfFirst === undefined || !this.pads.has(this.lastPadOfFirst))
        ) {
          this.lastPadOfFirst = raw.index;
        }
        if (this.capture) {
          const button = pad.buttons.findIndex(
            (v, i) => v > 0.5 && !this.padsHeld.get(raw.index)?.has(i),
          );
          if (button >= 0) this.capture(`Pad:${PAD_BUTTONS[button]}`);
        }
      }
    }
    for (const [index, pad] of this.pads) {
      if (seen.has(index)) continue;
      this.pads.delete(index);
      this.events.emit('gamepaddisconnected', { index, id: pad.id });
    }
  }

  /** Connected gamepads, normalized. */
  get gamepads(): PadState[] {
    return [...this.pads.values()];
  }

  /**
   * Listens to DOM events. Keys bound to actions do not scroll the page; typing in text fields
   * is left alone.
   *
   * @returns A function that removes the listeners.
   */
  attach(target: HTMLElement, toVirtual: (clientX: number, clientY: number) => Point): () => void {
    const bound = () =>
      new Set(
        [...this.parsed.values()].flat().flatMap((b) => (b.device === 'keyboard' ? [b.code] : [])),
      );
    const typing = (event: Event) => {
      const element = event.target as HTMLElement | null;
      return (
        !!element &&
        (element.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(element.tagName))
      );
    };
    const onKeyDown = (event: KeyboardEvent) => {
      // In a text field, letters stay text; named keys (arrows, Escape, Enter, Tab) still feed
      // actions so menus can leave the field. The field keeps the key's default behavior.
      if (typing(event)) {
        if (event.key.length > 1) this.keyDown(event.code, event.repeat);
        return;
      }
      if (bound().has(event.code)) event.preventDefault();
      this.keyDown(event.code, event.repeat);
    };
    const onKeyUp = (event: KeyboardEvent) => this.keyUp(event.code);
    const point = (event: PointerEvent) => toVirtual(event.clientX, event.clientY);
    const type = (event: PointerEvent) =>
      event.pointerType === 'touch' ? 'touch' : event.pointerType === 'pen' ? 'pen' : 'mouse';
    const onDown = (event: PointerEvent) => {
      target.setPointerCapture?.(event.pointerId);
      this.pointerDown(event.pointerId, type(event), event.button, point(event));
    };
    const onUp = (event: PointerEvent) =>
      this.pointerUp(event.pointerId, type(event), event.button, point(event));
    const onMove = (event: PointerEvent) =>
      this.pointerMove(event.pointerId, type(event), point(event));
    const onBlur = () => this.releaseAll();
    const onContext = (event: Event) => event.preventDefault();
    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('keyup', onKeyUp);
    window.addEventListener('blur', onBlur);
    target.addEventListener('pointerdown', onDown);
    target.addEventListener('pointerup', onUp);
    target.addEventListener('pointercancel', onUp);
    target.addEventListener('pointermove', onMove);
    target.addEventListener('contextmenu', onContext);
    target.style.touchAction = 'none';
    return () => {
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('keyup', onKeyUp);
      window.removeEventListener('blur', onBlur);
      target.removeEventListener('pointerdown', onDown);
      target.removeEventListener('pointerup', onUp);
      target.removeEventListener('pointercancel', onUp);
      target.removeEventListener('pointermove', onMove);
      target.removeEventListener('contextmenu', onContext);
    };
  }
}
