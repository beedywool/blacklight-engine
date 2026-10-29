import { parseBinding, type Binding, type Device, type PadState } from '@blacklight/core';
import { promptUrls as urls } from './prompt-urls.js';

/** Gamepad families with their own button art. */
export type PadFamily = 'xbox' | 'playstation' | 'switch';

/** What to draw for one binding: an image, or text when no art exists. */
export interface Glyph {
  src?: string;
  text: string;
}

/**
 * Button art for input prompts. The default pack is Kenney's Input Prompts (CC0); a game can
 * register its own and select it with `setPromptPack`.
 */
export interface PromptPack {
  name: string;
  /** Glyph for a binding on a device family, or `undefined` to fall back to the default pack. */
  glyph(binding: Binding, family: PadFamily | 'keyboard' | 'mouse' | 'touch'): Glyph | undefined;
}

/** URL of a glyph file (`xbox/xbox_button_a`), resolved when first shown. */
const art = { get: (key: string): string | undefined => urls[key]?.() };

/** Pad button name → file name per family (Kenney naming). */
const PAD: Record<PadFamily, Record<string, string>> = {
  xbox: {
    A: 'xbox_button_a',
    B: 'xbox_button_b',
    X: 'xbox_button_x',
    Y: 'xbox_button_y',
    LB: 'xbox_lb',
    RB: 'xbox_rb',
    LT: 'xbox_lt',
    RT: 'xbox_rt',
    Back: 'xbox_button_view',
    Start: 'xbox_button_menu',
    LS: 'xbox_stick_l_press',
    RS: 'xbox_stick_r_press',
    Up: 'xbox_dpad_up',
    Down: 'xbox_dpad_down',
    Left: 'xbox_dpad_left',
    Right: 'xbox_dpad_right',
    Home: 'xbox_guide',
    LeftStickLeft: 'xbox_stick_l_left',
    LeftStickRight: 'xbox_stick_l_right',
    LeftStickUp: 'xbox_stick_l_up',
    LeftStickDown: 'xbox_stick_l_down',
    RightStickLeft: 'xbox_stick_r_left',
    RightStickRight: 'xbox_stick_r_right',
    RightStickUp: 'xbox_stick_r_up',
    RightStickDown: 'xbox_stick_r_down',
  },
  playstation: {
    A: 'playstation_button_cross',
    B: 'playstation_button_circle',
    X: 'playstation_button_square',
    Y: 'playstation_button_triangle',
    LB: 'playstation_trigger_l1',
    RB: 'playstation_trigger_r1',
    LT: 'playstation_trigger_l2',
    RT: 'playstation_trigger_r2',
    Back: 'playstation5_button_create',
    Start: 'playstation5_button_options',
    LS: 'playstation_button_l3',
    RS: 'playstation_button_r3',
    Up: 'playstation_dpad_up',
    Down: 'playstation_dpad_down',
    Left: 'playstation_dpad_left',
    Right: 'playstation_dpad_right',
    Home: 'playstation_button_analog',
    LeftStickLeft: 'playstation_stick_l_left',
    LeftStickRight: 'playstation_stick_l_right',
    LeftStickUp: 'playstation_stick_l_up',
    LeftStickDown: 'playstation_stick_l_down',
    RightStickLeft: 'playstation_stick_r_left',
    RightStickRight: 'playstation_stick_r_right',
    RightStickUp: 'playstation_stick_r_up',
    RightStickDown: 'playstation_stick_r_down',
  },
  // Nintendo's layout swaps A/B and X/Y: the bottom button (standard "A") is labelled B.
  switch: {
    A: 'switch_button_b',
    B: 'switch_button_a',
    X: 'switch_button_y',
    Y: 'switch_button_x',
    LB: 'switch_button_l',
    RB: 'switch_button_r',
    LT: 'switch_button_zl',
    RT: 'switch_button_zr',
    Back: 'switch_button_minus',
    Start: 'switch_button_plus',
    LS: 'switch_stick_l_press',
    RS: 'switch_stick_r_press',
    Up: 'switch_dpad_up',
    Down: 'switch_dpad_down',
    Left: 'switch_dpad_left',
    Right: 'switch_dpad_right',
    Home: 'switch_button_home',
    LeftStickLeft: 'switch_stick_l_left',
    LeftStickRight: 'switch_stick_l_right',
    LeftStickUp: 'switch_stick_l_up',
    LeftStickDown: 'switch_stick_l_down',
    RightStickLeft: 'switch_stick_r_left',
    RightStickRight: 'switch_stick_r_right',
    RightStickUp: 'switch_stick_r_up',
    RightStickDown: 'switch_stick_r_down',
  },
};

const KEYS: Record<string, string> = {
  ArrowLeft: 'arrow_left',
  ArrowRight: 'arrow_right',
  ArrowUp: 'arrow_up',
  ArrowDown: 'arrow_down',
  Space: 'space',
  Enter: 'enter',
  Escape: 'escape',
  Backspace: 'backspace',
  Tab: 'tab',
  ShiftLeft: 'shift',
  ShiftRight: 'shift',
  ControlLeft: 'ctrl',
  ControlRight: 'ctrl',
  AltLeft: 'alt',
  AltRight: 'alt',
  MetaLeft: 'win',
  MetaRight: 'win',
  CapsLock: 'capslock',
  Delete: 'delete',
  Insert: 'insert',
  Home: 'home',
  End: 'end',
  PageUp: 'page_up',
  PageDown: 'page_down',
  Minus: 'minus',
  Equal: 'equals',
  Comma: 'comma',
  Period: 'period',
  Slash: 'slash_forward',
  Backslash: 'slash_back',
  Semicolon: 'semicolon',
  Quote: 'apostrophe',
  BracketLeft: 'bracket_open',
  BracketRight: 'bracket_close',
  Backquote: 'tilde',
  NumpadEnter: 'numpad_enter',
  NumpadAdd: 'numpad_plus',
};

const MOUSE: Record<string, string> = {
  Left: 'mouse_left',
  Right: 'mouse_right',
  Middle: 'mouse_scroll',
  Back: 'mouse_side_back',
  Forward: 'mouse_side_forward',
};

function keyFile(code: string): string | undefined {
  if (KEYS[code]) return KEYS[code];
  const letter = /^Key([A-Z])$/.exec(code);
  if (letter) return letter[1]!.toLowerCase();
  const digit = /^(?:Digit|Numpad)(\d)$/.exec(code);
  if (digit) return digit[1];
  const fn = /^F(\d{1,2})$/.exec(code);
  if (fn) return `f${fn[1]}`;
  return undefined;
}

function label(binding: Binding): string {
  const [prefix, name] = binding.includes(':') ? binding.split(':', 2) : ['Key', binding];
  if (prefix === 'Key') return name!.replace(/^Key|^Digit|^Arrow/, '');
  return name ?? binding;
}

/** The default pack: Kenney Input Prompts 1.5 (CC0), shipped with `@blacklight/ui`. */
/** Kenney file (`xbox/xbox_button_a`) for a binding, `undefined` when the pack has none. */
export function kenneyFile(
  binding: Binding,
  family: PadFamily | 'keyboard' | 'mouse' | 'touch',
): string | undefined {
  const parsed = parseBinding(binding);
  let file: string | undefined;
  if (parsed.device === 'keyboard') {
    const key = keyFile(parsed.code);
    file = key && `keyboard/keyboard_${key}`;
  } else if (parsed.device === 'mouse') {
    file = `keyboard/${MOUSE[binding.split(':')[1]!] ?? 'mouse'}`;
  } else if (parsed.device === 'touch') {
    file = 'touch/touch_tap';
  } else {
    const pad = (['xbox', 'playstation', 'switch'] as const).includes(family as PadFamily)
      ? (family as PadFamily)
      : 'xbox';
    const name = PAD[pad][binding.split(':')[1]!];
    file = name && `${pad}/${name}`;
  }
  return file;
}

export const kenneyPack: PromptPack = {
  name: 'kenney',
  glyph(binding, family) {
    const file = kenneyFile(binding, family);
    return { src: file ? art.get(file) : undefined, text: label(binding) };
  },
};

let pack: PromptPack = kenneyPack;

/** Replaces the button art (missing glyphs fall back to the Kenney pack). */
export function setPromptPack(next: PromptPack): void {
  pack = next;
}

export function glyphFor(
  binding: Binding,
  family: PadFamily | 'keyboard' | 'mouse' | 'touch',
): Glyph {
  return (
    pack.glyph(binding, family) ?? kenneyPack.glyph(binding, family) ?? { text: label(binding) }
  );
}

/** Family of a gamepad from its id (vendor 054c: Sony, 057e: Nintendo), Xbox art otherwise. */
export function padFamily(pad: Pick<PadState, 'id'> | undefined): PadFamily {
  const id = pad?.id.toLowerCase() ?? '';
  // Xbox first: "Xbox Wireless Controller" would otherwise match Sony's "Wireless Controller".
  if (/045e|xbox|xinput/.test(id)) return 'xbox';
  if (/054c|playstation|dualsense|dualshock|wireless controller/.test(id)) return 'playstation';
  if (/057e|nintendo|switch|pro controller|joy-con/.test(id)) return 'switch';
  return 'xbox';
}

/** Binding to show for an action on a device: the first binding of that device. */
export function bindingForDevice(
  bindings: readonly Binding[],
  device: Device,
): Binding | undefined {
  const want = device === 'gamepad' ? 'gamepad' : device;
  return bindings.find((b) => {
    try {
      return parseBinding(b).device === want;
    } catch {
      return false;
    }
  });
}
