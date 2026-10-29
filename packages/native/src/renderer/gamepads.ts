import type { Game, Platform } from '@blacklight/core';
import type { SdlPadState } from '../bridge';

/**
 * A pad read by SDL in the main process, in the shape of the browser's `Gamepad` with the standard
 * mapping, so the input system, rebinding and the UI's prompt glyphs work unchanged. The id
 * follows Chrome's format (`Name (STANDARD GAMEPAD Vendor: 045e Product: 0b13)`).
 */
function toGamepad(
  state: SdlPadState,
  index: number,
  rumble: (strong: number, weak: number, duration: number) => void,
): Gamepad {
  const hex = (n: number) => n.toString(16).padStart(4, '0');
  const effect = (_type: string, params?: GamepadEffectParameters) => {
    rumble(params?.strongMagnitude ?? 0, params?.weakMagnitude ?? 0, params?.duration ?? 200);
    return Promise.resolve('complete' as GamepadHapticsResult);
  };
  return {
    index,
    id: `${state.name} (STANDARD GAMEPAD Vendor: ${hex(state.vendor)} Product: ${hex(state.product)})`,
    mapping: 'standard',
    connected: true,
    timestamp: performance.now(),
    axes: state.axes,
    buttons: state.buttons.map((value) => ({ value, pressed: value > 0.5, touched: value > 0 })),
    vibrationActuator: state.hasRumble
      ? ({
          type: 'dual-rumble',
          effects: ['dual-rumble'],
          playEffect: effect,
          reset: () => Promise.resolve('complete'),
        } as unknown as GamepadHapticActuator)
      : null,
    hapticActuators: [],
  } as unknown as Gamepad;
}

/** SDL pads by the index the input system sees. */
export class SdlGamepads {
  private states: SdlPadState[] = [];
  /** SDL id → stable small index (the lowest free one when a pad connects). */
  private readonly indices = new Map<number, number>();

  constructor(private readonly platform: Platform) {
    platform.on('sdl:pads', (payload) => this.update(payload as SdlPadState[]));
  }

  /** Starts reading SDL pads. `false` when the app has no SDL (the Gamepad API stays in use). */
  async start(): Promise<boolean> {
    try {
      this.update(await this.platform.invoke<SdlPadState[]>('sdl', 'pads'));
      return true;
    } catch {
      return false;
    }
  }

  update(states: SdlPadState[]): void {
    const live = new Set(states.map((s) => s.id));
    for (const id of [...this.indices.keys()]) if (!live.has(id)) this.indices.delete(id);
    for (const state of states) {
      if (this.indices.has(state.id)) continue;
      const used = new Set(this.indices.values());
      let index = 0;
      while (used.has(index)) index++;
      this.indices.set(state.id, index);
    }
    this.states = states;
  }

  /** What `navigator.getGamepads()` would return. */
  read = (): (Gamepad | null)[] =>
    this.states.map((state) =>
      toGamepad(state, this.indices.get(state.id)!, (strong, weak, duration) => {
        void this.platform
          .invoke('sdl', 'rumble', state.id, clamp(strong), clamp(weak), Math.round(duration))
          .catch(() => undefined);
      }),
    );

  /** SDL state of the pad the input system calls `index`. */
  state(index: number): SdlPadState | undefined {
    const id = [...this.indices].find(([, i]) => i === index)?.[0];
    return this.states.find((s) => s.id === id);
  }
}

function clamp(value: number): number {
  return Math.min(1, Math.max(0, value));
}

const installed = new WeakMap<Game, SdlGamepads>();

/** @internal Called by the desktop plugin: routes the input system to SDL pads. */
export async function useSdlGamepads(game: Game): Promise<boolean> {
  const pads = new SdlGamepads(game.platform);
  if (!(await pads.start())) return false;
  game.input.getGamepads = pads.read;
  installed.set(game, pads);
  return true;
}

/** Colors as `'#ff8800'` or `[255, 136, 0]`. */
export type LedColor = string | [number, number, number];

function rgb(color: LedColor): [number, number, number] {
  if (Array.isArray(color))
    return color.map((c) => Math.round(Math.min(255, Math.max(0, c)))) as [number, number, number];
  const match = /^#?([0-9a-f]{6})$/i.exec(color);
  if (!match) throw new Error(`Invalid LED color "${color}": use "#rrggbb" or [r, g, b].`);
  const n = parseInt(match[1]!, 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

/** Desktop extras of one gamepad, from {@link gamepad}. */
export interface DesktopGamepad {
  /** SDL's name of the pad. */
  readonly name: string | undefined;
  /** `xboxOne`, `ps5`, `nintendoSwitchPro`… */
  readonly type: string | null | undefined;
  readonly hasLed: boolean;
  readonly hasRumbleTriggers: boolean;
  /** Always `false` for now: the SDL binding does not expose controller sensors. */
  readonly hasGyro: boolean;
  /** Sets the light bar (PlayStation pads, some others). */
  led(color: LedColor): Promise<void>;
  /** Rumbles the triggers (Xbox One and Series pads). Strengths 0–1, duration in ms. */
  rumbleTriggers(left: number, right: number, duration?: number): Promise<void>;
}

/**
 * Desktop extras for a gamepad (by the index the input system uses, see `game.input.gamepads`):
 * LED color, trigger rumble, capabilities. On the web and without SDL, calls do nothing and
 * capabilities read `false`.
 *
 * @example
 * ```ts
 * const pad = gamepad(this.game, 0);
 * if (pad.hasLed) await pad.led('#ff2200');
 * await pad.rumbleTriggers(0.2, 0.8, 300);
 * ```
 */
export function gamepad(game: Game, index: number): DesktopGamepad {
  const pads = installed.get(game);
  const state = () => pads?.state(index);
  const call = async (method: string, ...args: unknown[]) => {
    const pad = state();
    if (!pad) return;
    await game.platform.invoke('sdl', method, pad.id, ...args);
  };
  return {
    get name(): string | undefined {
      return state()?.name;
    },
    get type(): string | null | undefined {
      return state()?.type;
    },
    get hasLed(): boolean {
      return state()?.hasLed ?? false;
    },
    get hasRumbleTriggers(): boolean {
      return state()?.hasRumbleTriggers ?? false;
    },
    get hasGyro(): boolean {
      return state()?.hasGyro ?? false;
    },
    led: (color: LedColor) => call('led', ...rgb(color)),
    rumbleTriggers: (left: number, right: number, duration = 200) =>
      call('rumbleTriggers', clamp(left), clamp(right), Math.round(duration)),
  };
}
