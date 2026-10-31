import { PAD_BUTTONS, type PadButton } from './gamepad';

/**
 * One input source in an action map:
 * - a keyboard `KeyboardEvent.code`: `ArrowLeft`, `KeyA`, `Space`, `Enter`, `ShiftLeft`…
 * - `Mouse:Left`, `Mouse:Right`, `Mouse:Middle`
 * - `Touch` (any finger on the screen)
 * - `Pad:A` … `Pad:Home` (Xbox names: A B X Y LB RB LT RT Back Start LS RS Up Down Left Right Home)
 * - `Pad:LeftStickLeft` / `Right` / `Up` / `Down`, same for `RightStick`
 */
export type Binding = string;

export type ParsedBinding =
  | { device: 'keyboard'; code: string }
  | { device: 'mouse'; button: number }
  | { device: 'touch' }
  | { device: 'gamepad'; button: number }
  | { device: 'gamepad'; axis: number; sign: 1 | -1 };

const MOUSE: Record<string, number> = { Left: 0, Middle: 1, Right: 2, Back: 3, Forward: 4 };
const STICKS: Record<string, [number, 1 | -1]> = {
  LeftStickLeft: [0, -1],
  LeftStickRight: [0, 1],
  LeftStickUp: [1, -1],
  LeftStickDown: [1, 1],
  RightStickLeft: [2, -1],
  RightStickRight: [2, 1],
  RightStickUp: [3, -1],
  RightStickDown: [3, 1],
};

/**
 * Parses a binding string into the device and button or axis it reads. `resolveConfig` uses it to
 * report invalid bindings in `game.config.ts`.
 *
 * @throws Error explaining the accepted forms.
 * @example
 * ```ts
 * import { parseBinding } from '@blacklight/core';
 *
 * parseBinding('Pad:LeftStickLeft'); // { device: 'gamepad', axis: 0, sign: -1 }
 * parseBinding('KeyJ'); // { device: 'keyboard', code: 'KeyJ' }
 * ```
 */
export function parseBinding(binding: Binding): ParsedBinding {
  if (binding === 'Touch') return { device: 'touch' };
  const [prefix, name = ''] = binding.includes(':') ? binding.split(':', 2) : ['Key', binding];
  if (prefix === 'Key' && /^[A-Za-z0-9]+$/.test(name)) return { device: 'keyboard', code: name };
  if (prefix === 'Mouse' && name in MOUSE) return { device: 'mouse', button: MOUSE[name]! };
  if (prefix === 'Pad') {
    const button = PAD_BUTTONS.indexOf(name as PadButton);
    if (button >= 0) return { device: 'gamepad', button };
    const stick = STICKS[name];
    if (stick) return { device: 'gamepad', axis: stick[0], sign: stick[1] };
  }
  throw new Error(
    `Unknown input binding "${binding}". Use a key code ("ArrowLeft", "KeyA", "Space"), "Mouse:Left", "Touch", ` +
      `"Pad:A"…"Pad:Home" or "Pad:LeftStickLeft".`,
  );
}

/**
 * Readable form of a binding for menus (`KeyA` → `A`, `Pad:LT` → `LT`).
 *
 * @example
 * ```ts
 * import { bindingLabel } from '@blacklight/core';
 *
 * const labels = this.game.input.bindingsOf('jump').map(bindingLabel); // ['Space', 'Z', 'A']
 * ```
 */
export function bindingLabel(binding: Binding): string {
  const parsed = parseBinding(binding);
  switch (parsed.device) {
    case 'keyboard':
      return (
        parsed.code
          .replace(/^Key/, '')
          .replace(/^Digit/, '')
          .replace(/^Arrow/, '') || parsed.code
      );
    case 'mouse':
      return `${binding.split(':')[1]} click`;
    case 'touch':
      return 'Touch';
    case 'gamepad':
      return binding.split(':')[1]!;
  }
}

/** Default actions: menus and movement work in every game without configuration. */
export const DEFAULT_ACTIONS: Record<string, Binding[]> = {
  left: ['ArrowLeft', 'KeyA', 'Pad:Left', 'Pad:LeftStickLeft'],
  right: ['ArrowRight', 'KeyD', 'Pad:Right', 'Pad:LeftStickRight'],
  up: ['ArrowUp', 'KeyW', 'Pad:Up', 'Pad:LeftStickUp'],
  down: ['ArrowDown', 'KeyS', 'Pad:Down', 'Pad:LeftStickDown'],
  confirm: ['Enter', 'Space', 'Pad:A'],
  back: ['Escape', 'Backspace', 'Pad:B'],
  pause: ['Escape', 'Pad:Start'],
  jump: ['Space', 'KeyZ', 'Pad:A'],
  action: ['KeyX', 'ShiftLeft', 'Pad:X'],
  tabLeft: ['KeyQ', 'PageUp', 'Pad:LB'],
  tabRight: ['KeyE', 'PageDown', 'Pad:RB'],
};
