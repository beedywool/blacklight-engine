import { gridSheet, parseGridName, type GridSpec } from './engine';
import { formatJson } from './json';

/** Width and height from a PNG header, or `undefined` when the data is not a PNG. */
export function pngSize(data: Uint8Array): { width: number; height: number } | undefined {
  const signature = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
  if (data.length < 24 || signature.some((byte, i) => data[i] !== byte)) return undefined;
  const view = new DataView(data.buffer, data.byteOffset, data.byteLength);
  return { width: view.getUint32(16), height: view.getUint32(20) };
}

/** Frames of a grid over an image, as the runtime cuts them (`gridSheet`). */
export interface Slice {
  spec: GridSpec;
  columns: number;
  rows: number;
  frames: { x: number; y: number; width: number; height: number }[];
}

export function slice(spec: GridSpec, width: number, height: number): Slice {
  const frames = gridSheet(spec, width, height).frames.map((f) => f.rect);
  const columns = new Set(frames.map((f) => f.x)).size;
  return { spec, columns, rows: columns ? frames.length / columns : 0, frames };
}

/** File name with the grid encoded (`hero.png` → `hero@32x32.png`, `+2` for spacing). */
export function gridFileName(file: string, spec: GridSpec): string {
  const dot = file.lastIndexOf('.');
  const stem = file.slice(0, dot).replace(/@\d+x\d+(?:\+\d+)?$/, '');
  return `${stem}@${spec.width}x${spec.height}${spec.spacing ? `+${spec.spacing}` : ''}${file.slice(dot)}`;
}

/**
 * A frame size guess for an image: the grid in its name, else square frames of the image
 * height (horizontal strips), else the whole image.
 */
export function guessGrid(file: string, width: number, height: number): GridSpec {
  const named = parseGridName(file);
  if (named) return named;
  if (width > height && width % height === 0) return { width: height, height, spacing: 0 };
  if (height > width && height % width === 0) return { width, height: width, spacing: 0 };
  return { width, height, spacing: 0 };
}

/** Animations chosen in the slicer: name → frame indices. */
export type SlicedAnimations = Record<string, number[]>;

/**
 * `.anim.json` content for a sliced sheet. Consecutive frames are written as a range
 * (`{ "from": 0, "to": 3 }`), others as a list.
 */
export function animFileFor(
  imageFile: string,
  animations: SlicedAnimations,
  fps: number,
  schema: string,
): string {
  const entries = Object.entries(animations).filter(([name]) => name.trim());
  const json = {
    $schema: schema,
    source: `./${imageFile}`,
    fps,
    ...(entries[0] && { default: entries[0][0] }),
    animations: Object.fromEntries(
      entries.map(([name, frames]) => {
        const consecutive =
          frames.length > 2 && frames.every((f, i) => i === 0 || f === frames[i - 1]! + 1);
        return [name, { frames: consecutive ? { from: frames[0]!, to: frames.at(-1)! } : frames }];
      }),
    ),
  };
  return formatJson(json);
}
