import { PNG } from 'pngjs';

export interface PackInput {
  id: string;
  width: number;
  height: number;
}

export interface Placement {
  id: string;
  page: number;
  x: number;
  y: number;
}

/**
 * Shelf packing: tallest images first, left to right, a new shelf when a row is full and a new
 * page when a page is full. `padding` pixels separate images (and hold their extruded edges).
 */
export function pack(
  images: PackInput[],
  size = 4096,
  padding = 2,
): { placements: Placement[]; pages: { width: number; height: number }[] } {
  const sorted = [...images].sort((a, b) => b.height - a.height || b.width - a.width);
  const placements: Placement[] = [];
  const pages: { width: number; height: number }[] = [];
  let page = -1;
  let x = 0;
  let y = 0;
  let shelf = 0;
  const newPage = () => {
    page++;
    pages.push({ width: 0, height: 0 });
    x = y = shelf = 0;
  };
  for (const image of sorted) {
    const w = image.width + padding * 2;
    const h = image.height + padding * 2;
    if (w > size || h > size)
      throw new Error(
        `${image.id} (${image.width}×${image.height}) does not fit in a ${size}×${size} atlas.`,
      );
    if (page < 0) newPage();
    if (x + w > size) {
      x = 0;
      y += shelf;
      shelf = 0;
    }
    if (y + h > size) newPage();
    placements.push({ id: image.id, page, x: x + padding, y: y + padding });
    const current = pages[page]!;
    current.width = Math.max(current.width, x + w);
    current.height = Math.max(current.height, y + h);
    x += w;
    shelf = Math.max(shelf, h);
  }
  return { placements, pages };
}

/** Reads the size of a PNG from its header without decoding it. */
export function pngSize(buffer: Buffer): { width: number; height: number } | undefined {
  if (buffer.length < 24 || buffer.readUInt32BE(12) !== 0x49484452) return undefined;
  return { width: buffer.readUInt32BE(16), height: buffer.readUInt32BE(20) };
}

export interface AtlasFrame {
  page: number;
  frame: [number, number, number, number];
}

/**
 * Packs PNG files into atlas pages. Each image's edge pixels are extruded into its padding so
 * filtering never samples a neighbour.
 */
export function buildAtlases(
  files: { id: string; data: Buffer }[],
  size = 4096,
  padding = 2,
): { pages: Buffer[]; frames: Map<string, AtlasFrame> } {
  const decoded = new Map(files.map((f) => [f.id, PNG.sync.read(f.data)]));
  const { placements, pages } = pack(
    [...decoded].map(([id, png]) => ({ id, width: png.width, height: png.height })),
    size,
    padding,
  );
  const canvases = pages.map(
    (p) => new PNG({ width: Math.max(1, p.width), height: Math.max(1, p.height) }),
  );
  const frames = new Map<string, AtlasFrame>();
  for (const placement of placements) {
    const png = decoded.get(placement.id)!;
    const target = canvases[placement.page]!;
    for (let dy = -padding; dy < png.height + padding; dy++) {
      for (let dx = -padding; dx < png.width + padding; dx++) {
        const sx = Math.min(png.width - 1, Math.max(0, dx));
        const sy = Math.min(png.height - 1, Math.max(0, dy));
        const tx = placement.x + dx;
        const ty = placement.y + dy;
        if (tx < 0 || ty < 0 || tx >= target.width || ty >= target.height) continue;
        const from = (sy * png.width + sx) * 4;
        const to = (ty * target.width + tx) * 4;
        png.data.copy(target.data, to, from, from + 4);
      }
    }
    frames.set(placement.id, {
      page: placement.page,
      frame: [placement.x, placement.y, png.width, png.height],
    });
  }
  return { pages: canvases.map((c) => PNG.sync.write(c)), frames };
}
