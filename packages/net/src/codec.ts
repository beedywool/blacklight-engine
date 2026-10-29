import type { ActionName, PlayerInput } from '@blacklight/core';

/** Which actions travel over the network, as on/off bits or analog bytes. */
export interface InputLayout {
  /** Actions sent as one bit each (held or not): directions on a D-pad, buttons. */
  buttons?: readonly ActionName[];
  /** Actions sent with their analog value (0–1, 256 steps): sticks, triggers. */
  analog?: readonly ActionName[];
}

/** State of one action, as `PlayerInput` stores it. */
export interface ActionState {
  value: number;
  held: boolean;
  pressed: boolean;
  released: boolean;
}

/**
 * Packs a player's input into a few bytes for the network and unpacks it into action states.
 * Only `held` and analog values travel; `pressed` and `released` are recomputed from the previous
 * step, so they are the same on every machine.
 *
 * @example
 * ```ts
 * const inputs = new InputCodec({ buttons: ['left', 'right', 'up', 'down', 'action'] });
 * inputs.size; // 1 byte
 * inputs.encode({ left: true, action: true }); // bots and tests
 * ```
 */
export class InputCodec {
  readonly buttons: readonly ActionName[];
  readonly analog: readonly ActionName[];
  /** Bytes per player per step. */
  readonly size: number;
  private readonly buttonBytes: number;

  constructor(layout: InputLayout) {
    this.buttons = [...(layout.buttons ?? [])];
    this.analog = [...(layout.analog ?? [])];
    const all = [...this.buttons, ...this.analog];
    if (all.length === 0) {
      throw new Error(
        'InputCodec needs at least one action: `new InputCodec({ buttons: ["left", "right"] })`.',
      );
    }
    const duplicate = all.find((name, i) => all.indexOf(name) !== i);
    if (duplicate !== undefined) {
      throw new Error(
        `Action "${duplicate}" is listed twice in the input layout; keep it in buttons or analog only.`,
      );
    }
    this.buttonBytes = Math.ceil(this.buttons.length / 8);
    this.size = this.buttonBytes + this.analog.length;
  }

  /** An input with every action released. */
  neutral(): Uint8Array {
    return new Uint8Array(this.size);
  }

  /** Samples the actions of a local player (devices, on-screen controls). */
  read(player: PlayerInput): Uint8Array {
    const values: Partial<Record<string, number | boolean>> = {};
    for (const action of this.buttons) values[action] = player.held(action);
    for (const action of this.analog) values[action] = player.value(action);
    return this.encode(values);
  }

  /** Builds an input from action values: `true`/`false` for buttons, 0–1 for analog actions. */
  encode(values: Partial<Record<ActionName, number | boolean>>): Uint8Array {
    const out = new Uint8Array(this.size);
    this.buttons.forEach((action, i) => {
      const value = values[action];
      if (value === true || (typeof value === 'number' && value >= 0.5))
        out[i >> 3]! |= 1 << (i & 7);
    });
    this.analog.forEach((action, i) => {
      const value = values[action];
      const number = value === true ? 1 : typeof value === 'number' ? value : 0;
      out[this.buttonBytes + i] = Math.round(Math.min(1, Math.max(0, number)) * 255);
    });
    return out;
  }

  /** Action values (0–1) of an input. */
  decode(input: Uint8Array): Record<string, number> {
    const out: Record<string, number> = {};
    this.buttons.forEach((action, i) => {
      out[action] = (input[i >> 3]! >> (i & 7)) & 1;
    });
    this.analog.forEach((action, i) => {
      out[action] = input[this.buttonBytes + i]! / 255;
    });
    return out;
  }

  /** Action states of a step from its input and the previous step's. */
  states(current: Uint8Array, previous: Uint8Array): Map<string, ActionState> {
    const now = this.decode(current);
    const before = this.decode(previous);
    const states = new Map<string, ActionState>();
    for (const action of [...this.buttons, ...this.analog]) {
      const value = now[action]!;
      const held = value >= 0.5;
      const wasHeld = before[action]! >= 0.5;
      states.set(action, { value, held, pressed: held && !wasHeld, released: !held && wasHeld });
    }
    return states;
  }
}
