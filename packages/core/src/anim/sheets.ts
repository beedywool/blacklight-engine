import type { Point, Rect } from '../math';

/** One frame of a sprite sheet, in pixels of the sheet image. */
export interface SheetFrame {
  /** Rectangle in the sheet image. */
  rect: Rect;
  /** Display duration in ms when the sheet defines it (Aseprite), else `undefined`. */
  duration?: number;
  /** Trim: where the rect sits inside the original, untrimmed frame. */
  sourceSize?: { width: number; height: number };
  offset?: Point;
}

export interface SheetTag {
  name: string;
  from: number;
  to: number;
  direction: 'forward' | 'reverse' | 'pingpong' | 'pingpong_reverse';
  repeat?: number;
}

export interface SheetSlice {
  name: string;
  /** Bounds per frame index, from the slice keys (a key applies until the next one). */
  bounds: (frame: number) => Rect | undefined;
  pivot: (frame: number) => Point | undefined;
}

/** A parsed sheet: frames in order, tags and slices. */
export interface Sheet {
  frames: SheetFrame[];
  tags: SheetTag[];
  slices: SheetSlice[];
  /** Image path relative to the sheet file, when the sheet names it. */
  image?: string;
}

interface AsepriteFrame {
  filename?: string;
  frame: { x: number; y: number; w: number; h: number };
  trimmed?: boolean;
  spriteSourceSize?: { x: number; y: number; w: number; h: number };
  sourceSize?: { w: number; h: number };
  duration?: number;
}

interface AsepriteSliceKey {
  frame: number;
  bounds: { x: number; y: number; w: number; h: number };
  pivot?: { x: number; y: number };
}

/** The JSON Aseprite exports (`--format json-hash` or `json-array`). */
export interface AsepriteJson {
  frames: AsepriteFrame[] | Record<string, AsepriteFrame>;
  meta: {
    image?: string;
    frameTags?: {
      name: string;
      from: number;
      to: number;
      direction?: string;
      repeat?: string | number;
    }[];
    slices?: { name: string; keys: AsepriteSliceKey[] }[];
  };
}

export function isAsepriteJson(value: unknown): value is AsepriteJson {
  return (
    typeof value === 'object' &&
    value !== null &&
    'frames' in value &&
    'meta' in value &&
    typeof (value as AsepriteJson).meta === 'object'
  );
}

function keyAt<T extends { frame: number }>(keys: T[], frame: number): T | undefined {
  let found: T | undefined;
  for (const key of keys)
    if (key.frame <= frame && (!found || key.frame >= found.frame)) found = key;
  return found;
}

/**
 * Reads an Aseprite JSON export (hash or array). Tags become animations; slices give per-frame
 * hitboxes (`hitbox` slice) and pivots (slice pivot).
 */
export function parseAseprite(json: AsepriteJson): Sheet {
  const list = Array.isArray(json.frames) ? json.frames : Object.values(json.frames);
  const frames = list.map<SheetFrame>((f) => ({
    rect: { x: f.frame.x, y: f.frame.y, width: f.frame.w, height: f.frame.h },
    duration: f.duration,
    sourceSize: f.sourceSize ? { width: f.sourceSize.w, height: f.sourceSize.h } : undefined,
    offset:
      f.trimmed && f.spriteSourceSize
        ? { x: f.spriteSourceSize.x, y: f.spriteSourceSize.y }
        : undefined,
  }));
  const tags = (json.meta.frameTags ?? []).map<SheetTag>((tag) => ({
    name: tag.name,
    from: tag.from,
    to: tag.to,
    direction: (['forward', 'reverse', 'pingpong', 'pingpong_reverse'].includes(tag.direction ?? '')
      ? tag.direction
      : 'forward') as SheetTag['direction'],
    repeat: tag.repeat === undefined ? undefined : Number(tag.repeat),
  }));
  const slices = (json.meta.slices ?? []).map<SheetSlice>((slice) => ({
    name: slice.name,
    bounds: (frame) => {
      const key = keyAt(slice.keys, frame);
      return key && { x: key.bounds.x, y: key.bounds.y, width: key.bounds.w, height: key.bounds.h };
    },
    pivot: (frame) => {
      const key = keyAt(slice.keys, frame);
      return key?.pivot && { x: key.bounds.x + key.pivot.x, y: key.bounds.y + key.pivot.y };
    },
  }));
  return { frames, tags, slices, image: json.meta.image };
}

/** Frame size and spacing encoded in a file name: `hero@64x64.png`, `hero@64x64+2.png`. */
export interface GridSpec {
  width: number;
  height: number;
  /** Margin around the sheet and spacing between frames, in pixels. */
  spacing: number;
}

const GRID_NAME = /@(\d+)x(\d+)(?:\+(\d+))?\.[a-z0-9]+$/i;

/** Reads the grid spec from a file name, or `undefined` when the name has none. */
export function parseGridName(file: string): GridSpec | undefined {
  const match = GRID_NAME.exec(file);
  if (!match) return undefined;
  return { width: Number(match[1]), height: Number(match[2]), spacing: Number(match[3] ?? 0) };
}

/** Cuts an image of `imageWidth` × `imageHeight` into grid frames, left to right, top to bottom. */
export function gridSheet(spec: GridSpec, imageWidth: number, imageHeight: number): Sheet {
  const { width, height, spacing } = spec;
  const frames: SheetFrame[] = [];
  for (let y = spacing; y + height <= imageHeight; y += height + spacing) {
    for (let x = spacing; x + width <= imageWidth; x += width + spacing) {
      frames.push({ rect: { x, y, width, height } });
    }
  }
  return { frames, tags: [], slices: [] };
}
