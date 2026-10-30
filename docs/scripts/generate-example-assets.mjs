// Run with `node docs/scripts/generate-example-assets.mjs`. Draws the art of the docs examples, the
// playground and the getting-started project (original pixel art, CC0): a 16x16 hero with idle and
// run frames, and a coin. The PNG files are committed; rerun only to change them.
import { copyFileSync, mkdirSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';

const require = createRequire(new URL('../../packages/cli/package.json', import.meta.url));
const { PNG } = require('pngjs');
const examples = new URL('../examples/', import.meta.url).pathname;

function png(width, height, paint) {
  const image = new PNG({ width, height });
  for (let y = 0; y < height; y++)
    for (let x = 0; x < width; x++) {
      const [r, g, b, a] = paint(x, y) ?? [0, 0, 0, 0];
      const i = (y * width + x) * 4;
      image.data.set([r, g, b, a], i);
    }
  return PNG.sync.write(image);
}

const WHITE = [255, 255, 255, 255];
const RED = [230, 0, 18, 255];
const DARK = [24, 24, 28, 255];
const GREY = [142, 142, 142, 255];

// Hero: frames 0-1 idle (breathing, blink), 2-5 run (legs cycle, body bobs).
const hero = png(96, 16, (x, y) => {
  const frame = Math.floor(x / 16);
  const fx = x % 16;
  const bob = frame >= 2 ? frame % 2 : frame === 1 ? 1 : 0;
  const top = 2 + bob;
  const head = (fx - 8) ** 2 + (y - (top + 2)) ** 2 <= 6;
  const body = fx >= 5 && fx <= 10 && y >= top + 4 && y <= 11;
  const scarf = fx >= 4 && fx <= 11 && y === top + 4;
  const eye = y === top + 2 && fx === 9 && frame !== 1;
  const run = frame - 2;
  const legs =
    y >= 12 &&
    (frame < 2
      ? fx === 6 || fx === 9
      : [
          [5, 10],
          [7, 8],
          [4, 11],
          [7, 8],
        ][run].includes(fx));
  if (eye) return DARK;
  if (head) return WHITE;
  if (scarf) return RED;
  if (body) return DARK;
  if (legs) return GREY;
  return undefined;
});
writeFileSync(`${examples}assets/hero@16x16.png`, hero);

const coin = png(8, 8, (x, y) => {
  const d = (x - 3.5) ** 2 + (y - 3.5) ** 2;
  if (d > 12) return undefined;
  return x === 3 && y >= 2 && y <= 5 ? WHITE : [255, 214, 10, 255];
});
writeFileSync(`${examples}assets/coin.png`, coin);

// The playground and the getting-started project carry their own copy, like a real game.
for (const dir of ['playground/objects/hero', 'getting-started/objects/hero']) {
  mkdirSync(`${examples}${dir}`, { recursive: true });
  copyFileSync(`${examples}assets/hero@16x16.png`, `${examples}${dir}/hero@16x16.png`);
}
