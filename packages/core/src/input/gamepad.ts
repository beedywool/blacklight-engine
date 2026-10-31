/** Gamepad buttons with the names used in bindings (`Pad:A`, `Pad:LT`…), Xbox layout. */
export const PAD_BUTTONS = [
  'A',
  'B',
  'X',
  'Y',
  'LB',
  'RB',
  'LT',
  'RT',
  'Back',
  'Start',
  'LS',
  'RS',
  'Up',
  'Down',
  'Left',
  'Right',
  'Home',
] as const;
/** Name of a gamepad button in the Xbox layout (`'A'`, `'LT'`, `'Start'`…), as in `Pad:A`. */
export type PadButton = (typeof PAD_BUTTONS)[number];

/** A gamepad read in the standard layout, whatever its browser mapping. */
export interface PadState {
  /** Index of the pad (stable while it stays connected). */
  index: number;
  /** Name the browser or SDL reports for the pad. */
  id: string;
  /** Button values 0–1 in {@link PAD_BUTTONS} order. */
  buttons: number[];
  /** Left stick x, y, right stick x, y, each −1 to 1. */
  axes: [number, number, number, number];
}

/** One SDL GameControllerDB entry, reduced to what the browser can use. */
export interface SdlMapping {
  vendor: number;
  product: number;
  platform: string;
  name: string;
  fields: Record<string, string>;
}

/** SDL field name → index in {@link PAD_BUTTONS}. */
const SDL_BUTTONS: Record<string, number> = {
  a: 0,
  b: 1,
  x: 2,
  y: 3,
  leftshoulder: 4,
  rightshoulder: 5,
  lefttrigger: 6,
  righttrigger: 7,
  back: 8,
  start: 9,
  leftstick: 10,
  rightstick: 11,
  dpup: 12,
  dpdown: 13,
  dpleft: 14,
  dpright: 15,
  guide: 16,
};
const SDL_AXES: Record<string, number> = { leftx: 0, lefty: 1, rightx: 2, righty: 3 };

/** Parses one line of gamecontrollerdb.txt. */
export function parseSdlMapping(line: string): SdlMapping | undefined {
  const parts = line.split(',');
  const guid = parts[0];
  if (!guid || guid.length !== 32) return undefined;
  const fields: Record<string, string> = {};
  for (const part of parts.slice(2)) {
    const colon = part.indexOf(':');
    if (colon > 0) fields[part.slice(0, colon)] = part.slice(colon + 1);
  }
  // SDL 2 GUID: bus (LE16), CRC, vendor (LE16), 0, product (LE16), 0, version (LE16), driver.
  const le16 = (offset: number) =>
    parseInt(guid.slice(offset + 2, offset + 4) + guid.slice(offset, offset + 2), 16);
  return {
    vendor: le16(8),
    product: le16(16),
    platform: fields.platform ?? '',
    name: parts[1] ?? '',
    fields,
  };
}

/** Vendor and product ids from a browser gamepad id (Chrome and Firefox formats). */
export function parseGamepadId(id: string): { vendor: number; product: number } | undefined {
  const chrome = /Vendor:\s*([0-9a-f]{4})\s*Product:\s*([0-9a-f]{4})/i.exec(id);
  if (chrome) return { vendor: parseInt(chrome[1]!, 16), product: parseInt(chrome[2]!, 16) };
  const firefox = /^([0-9a-f]{1,4})-([0-9a-f]{1,4})-/i.exec(id);
  if (firefox) return { vendor: parseInt(firefox[1]!, 16), product: parseInt(firefox[2]!, 16) };
  return undefined;
}

/** SDL platform name of the current browser. */
export function sdlPlatform(userAgent: string): string {
  if (/android/i.test(userAgent)) return 'Android';
  if (/iphone|ipad|ipod/i.test(userAgent)) return 'iOS';
  if (/mac os x|macintosh/i.test(userAgent)) return 'Mac OS X';
  if (/windows/i.test(userAgent)) return 'Windows';
  return 'Linux';
}

/** Reads a browser gamepad with the W3C standard mapping. */
export function readStandard(pad: Gamepad): PadState {
  return {
    index: pad.index,
    id: pad.id,
    buttons: PAD_BUTTONS.map((_, i) => pad.buttons[i]?.value ?? 0),
    axes: [pad.axes[0] ?? 0, pad.axes[1] ?? 0, pad.axes[2] ?? 0, pad.axes[3] ?? 0],
  };
}

/** Value of an SDL input source (`b3`, `a2`, `+a1`, `-a1`, `a2~`, `h0.4`) on a raw gamepad. */
function sdlValue(pad: Gamepad, source: string, asAxis: boolean): number {
  const match = /^([+-]?)([abh])(\d+)(?:\.(\d+))?(~?)$/.exec(source);
  if (!match) return 0;
  const [, half, kind, n, hatMask, invert] = match;
  const index = Number(n);
  if (kind === 'b') return pad.buttons[index]?.value ?? 0;
  if (kind === 'h') return hatPressed(pad, Number(hatMask)) ? 1 : 0;
  let value = pad.axes[index] ?? 0;
  if (invert) value = -value;
  if (half === '+') return Math.max(0, value);
  if (half === '-') return Math.max(0, -value);
  // A full axis used as a trigger goes from −1 (released) to 1 (pressed).
  return asAxis ? value : (value + 1) / 2;
}

/**
 * Browsers expose a hat either as one POV axis (Chrome: axis 9, eight steps between −1 and 1) or
 * as the last two axes (Firefox). Mask: 1 up, 2 right, 4 down, 8 left.
 */
function hatPressed(pad: Gamepad, mask: number): boolean {
  const pov = pad.axes[9];
  if (pad.axes.length >= 10 && pov !== undefined && pov >= -1.01 && pov <= 1.01) {
    const step = Math.round((pov + 1) / (2 / 7));
    const directions = [1, 3, 2, 6, 4, 12, 8, 9];
    return ((directions[step] ?? 0) & mask) !== 0;
  }
  const x = pad.axes[pad.axes.length - 2] ?? 0;
  const y = pad.axes[pad.axes.length - 1] ?? 0;
  return (
    (mask === 1 && y < -0.5) ||
    (mask === 4 && y > 0.5) ||
    (mask === 8 && x < -0.5) ||
    (mask === 2 && x > 0.5)
  );
}

/** Reads a non-standard gamepad through its SDL mapping. */
export function readWithSdl(pad: Gamepad, mapping: SdlMapping): PadState {
  const buttons = PAD_BUTTONS.map(() => 0);
  const axes: [number, number, number, number] = [0, 0, 0, 0];
  for (const [field, source] of Object.entries(mapping.fields)) {
    const button = SDL_BUTTONS[field];
    if (button !== undefined) buttons[button] = sdlValue(pad, source, false);
    const axis = SDL_AXES[field];
    if (axis !== undefined) axes[axis] = sdlValue(pad, source, true);
  }
  return { index: pad.index, id: pad.id, buttons, axes };
}

/**
 * Normalizes browser gamepads. Pads with the standard mapping are read directly; others go
 * through SDL_GameControllerDB (loaded on first need), matched by vendor and product for the
 * current platform.
 */
export class GamepadReader {
  private db: Map<string, SdlMapping> | undefined;
  private loadingDb: Promise<void> | undefined;
  private readonly platform: string;

  constructor(userAgent = typeof navigator === 'undefined' ? '' : navigator.userAgent) {
    this.platform = sdlPlatform(userAgent);
  }

  read(pad: Gamepad): PadState {
    if (pad.mapping === 'standard') return readStandard(pad);
    const ids = parseGamepadId(pad.id);
    if (!ids) return readStandard(pad);
    if (!this.db) {
      this.loadDb();
      return readStandard(pad);
    }
    const mapping = this.db.get(`${ids.vendor}:${ids.product}`);
    return mapping ? readWithSdl(pad, mapping) : readStandard(pad);
  }

  /** Loads the bundled database (a separate chunk, only fetched when a non-standard pad shows up). */
  loadDb(): Promise<void> {
    this.loadingDb ??= import('./gamecontrollerdb').then(({ GAME_CONTROLLER_DB }) => {
      const db = new Map<string, SdlMapping>();
      for (const line of GAME_CONTROLLER_DB.split('\n')) {
        const mapping = parseSdlMapping(line);
        if (mapping?.platform === this.platform)
          db.set(`${mapping.vendor}:${mapping.product}`, mapping);
      }
      this.db = db;
    });
    return this.loadingDb;
  }
}
