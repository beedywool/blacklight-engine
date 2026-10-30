// Run with `node e2e/fixtures/generate-bench-assets.mjs`. Generates the benchmark fixture's sprite
// sheet: a 32x32 runner, 8 frames (6 run, 2 idle), drawn in white so each sprite can be tinted.
import { writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
const require = createRequire(new URL('../../packages/cli/package.json', import.meta.url));
const { PNG } = require('pngjs');
const out = new URL('./bench', import.meta.url).pathname;

const size = 32;
const frames = 8;
const sheet = new PNG({ width: size * frames, height: size });
for (let frame = 0; frame < frames; frame++) {
  // Run frames swing the legs and bob the body; idle frames breathe.
  const run = frame < 6;
  const phase = (frame / 6) * Math.PI * 2;
  const bob = run ? Math.round(Math.abs(Math.sin(phase)) * 2) : frame - 6;
  const swing = run ? Math.round(Math.sin(phase) * 5) : 0;
  for (let y = 0; y < size; y++)
    for (let x = 0; x < size; x++) {
      const body = (x - 16) ** 2 / 81 + (y - 13 + bob) ** 2 / 100 <= 1;
      const eye = y === 10 - bob && (x === 13 || x === 19);
      const leftLeg = y >= 22 && y <= 29 && Math.abs(x - (12 + swing)) <= 1;
      const rightLeg = y >= 22 && y <= 29 && Math.abs(x - (20 - swing)) <= 1;
      const i = (y * sheet.width + frame * size + x) * 4;
      const [r, g, b, a] = eye
        ? [20, 20, 28, 255]
        : body
          ? [255, 255, 255, 255]
          : leftLeg || rightLeg
            ? [150, 150, 160, 255]
            : [0, 0, 0, 0];
      sheet.data[i] = r;
      sheet.data[i + 1] = g;
      sheet.data[i + 2] = b;
      sheet.data[i + 3] = a;
    }
}
writeFileSync(`${out}/objects/runner/runner@32x32.png`, PNG.sync.write(sheet));
