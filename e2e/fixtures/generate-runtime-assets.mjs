// Run with `node e2e/fixtures/generate-runtime-assets.mjs`. Generates the runtime fixture's art and sound: a 4-frame 16x16 hero, an 8x8 coin, a short blip.
import { writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
const require = createRequire(new URL('../../packages/cli/package.json', import.meta.url));
const { PNG } = require('pngjs');
const out = new URL('./runtime', import.meta.url).pathname;

function png(width, height, paint) {
  const p = new PNG({ width, height });
  for (let y = 0; y < height; y++)
    for (let x = 0; x < width; x++) {
      const [r, g, b, a] = paint(x, y);
      const i = (y * width + x) * 4;
      p.data[i] = r;
      p.data[i + 1] = g;
      p.data[i + 2] = b;
      p.data[i + 3] = a;
    }
  return PNG.sync.write(p);
}

// Hero sheet: frames 0-1 idle (blue body, eyes blink), 2-3 run (legs apart / together).
writeFileSync(
  `${out}/objects/hero/hero@16x16.png`,
  png(64, 16, (x, y) => {
    const frame = Math.floor(x / 16);
    const fx = x % 16;
    const body = fx >= 3 && fx <= 12 && y >= 2 && y <= 11;
    const eye = y === 5 && (fx === 6 || fx === 10) && frame !== 1;
    const legs =
      frame >= 2
        ? y >= 12 &&
          ((frame === 2 && (fx === 3 || fx === 4 || fx === 11 || fx === 12)) ||
            (frame === 3 && (fx === 6 || fx === 7 || fx === 8 || fx === 9)))
        : y >= 12 && (fx === 5 || fx === 6 || fx === 9 || fx === 10);
    if (eye) return [255, 255, 255, 255];
    if (body) return [39, 65, 232, 255];
    if (legs) return [21, 23, 30, 255];
    return [0, 0, 0, 0];
  }),
);
writeFileSync(
  `${out}/objects/coin/coin.png`,
  png(8, 8, (x, y) => {
    const d = (x - 3.5) ** 2 + (y - 3.5) ** 2;
    return d <= 12 ? [255, 214, 10, 255] : [0, 0, 0, 0];
  }),
);
// 120 ms 880 Hz blip, 16-bit mono PCM WAV.
const rate = 22050;
const samples = Math.floor(rate * 0.12);
const data = Buffer.alloc(samples * 2);
for (let i = 0; i < samples; i++)
  data.writeInt16LE(
    Math.round(Math.sin((i / rate) * 880 * Math.PI * 2) * 12000 * (1 - i / samples)),
    i * 2,
  );
const header = Buffer.alloc(44);
header.write('RIFF', 0);
header.writeUInt32LE(36 + data.length, 4);
header.write('WAVE', 8);
header.write('fmt ', 12);
header.writeUInt32LE(16, 16);
header.writeUInt16LE(1, 20);
header.writeUInt16LE(1, 22);
header.writeUInt32LE(rate, 24);
header.writeUInt32LE(rate * 2, 28);
header.writeUInt16LE(2, 32);
header.writeUInt16LE(16, 34);
header.write('data', 36);
header.writeUInt32LE(data.length, 40);
writeFileSync(`${out}/scenes/level/assets/coin.wav`, Buffer.concat([header, data]));
