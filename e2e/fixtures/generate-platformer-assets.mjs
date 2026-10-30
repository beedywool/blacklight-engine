// Generates the placeholder pixel art, sounds and level of templates/platformer (CC0, made here):
// sprite sheets and the tileset as PNG, sounds as WAV, the level as a Tiled JSON map.
// Run: node e2e/fixtures/generate-platformer-assets.mjs && pnpm prettier --write templates/platformer
import { mkdirSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';

const require = createRequire(new URL('../../packages/cli/package.json', import.meta.url));
const { PNG } = require('pngjs');
const root = join(import.meta.dirname, '../../templates/platformer');
const write = (path, data) => {
  mkdirSync(dirname(join(root, path)), { recursive: true });
  writeFileSync(join(root, path), data);
};

const PALETTE = {
  '.': null,
  k: [21, 23, 30], // outline
  w: [242, 242, 242],
  r: [230, 0, 18], // scarf
  b: [39, 65, 232], // body
  B: [24, 40, 160],
  s: [255, 205, 160], // skin
  y: [255, 214, 10],
  Y: [200, 150, 0],
  g: [76, 187, 23],
  G: [40, 120, 20],
  d: [122, 78, 44], // dirt
  D: [90, 56, 30],
  p: [168, 112, 60], // plank
  P: [120, 76, 40],
  c: [60, 160, 230], // water
  C: [30, 110, 190],
  m: [130, 130, 140], // stone
  M: [90, 90, 100],
  v: [120, 210, 90], // slime
  V: [60, 150, 50],
  o: [255, 140, 0],
  e: [200, 200, 210],
};

/** A PNG made of frames drawn as rows of palette letters, laid out left to right. */
function sheet(frames) {
  const height = frames[0].length;
  const width = frames[0][0].length;
  const png = new PNG({ width: width * frames.length, height });
  frames.forEach((rows, f) =>
    rows.forEach((row, y) =>
      [...row].forEach((letter, x) => {
        const color = PALETTE[letter];
        if (color === undefined) throw new Error(`unknown color "${letter}"`);
        const i = (y * png.width + f * width + x) * 4;
        if (color) {
          png.data.set(color, i);
          png.data[i + 3] = 255;
        }
      }),
    ),
  );
  return PNG.sync.write(png);
}

// Hero, 16×16: idle ×2, run ×4, jump, fall.
const head = [
  '................',
  '.....kkkkkk.....',
  '....kssssssk....',
  '....ksksskskk...',
  '....kssssssk....',
  '...krrrrrrrrk...',
];
const body = (arms) => [
  '....kbbbbbbk....',
  `...${arms}bbbbbb${arms}...`.slice(0, 16),
  '....kbbbbbbk....',
  '....kBBBBBBk....',
];
const legs = {
  stand: ['....kBk..kBk....', '....kkk..kkk....', '................'],
  apart: ['...kBk....kBk...', '..kkk......kkk..', '................'],
  mid: ['.....kBkkBk.....', '.....kkkkkk.....', '................'],
  tuck: ['....kBBkkBBk....', '....kkk..kkk....', '................'],
};
const hero = [
  [...head, ...body('k'), ...legs.stand],
  [...head.slice(0, 3), '....kssssssk....', ...head.slice(4), ...body('k'), ...legs.stand],
  [...head, ...body('k'), ...legs.apart],
  [...head, ...body('k'), ...legs.mid],
  [...head, ...body('k'), ...legs.apart.map((r) => [...r].reverse().join(''))],
  [...head, ...body('k'), ...legs.mid],
  [...head.slice(0, 5), '..krrrrrrrrrk...', ...body('s'), ...legs.tuck],
  [...head, ...body('s'), ...legs.apart],
];
const pad = (f) => [...Array(16 - f.length).fill('.'.repeat(16)), ...f];
write(
  'objects/hero/hero@16x16.png',
  sheet(hero.map((f) => pad(f.map((r) => r.padEnd(16, '.').slice(0, 16))))),
);

// Coin, 8×8, spinning ×4.
const coin = [
  ['..kkkk..', '.kyyyyk.', 'kyywyyYk', 'kyywyyYk', 'kyyyyyYk', 'kyyyyyYk', '.kYYYYk.', '..kkkk..'],
  ['...kk...', '..kyyk..', '.kywyYk.', '.kywyYk.', '.kyyyYk.', '.kyyyYk.', '..kYYk..', '...kk...'],
  ['...kk...', '...kk...', '...yk...', '...yk...', '...yk...', '...yk...', '...kk...', '...kk...'],
  ['...kk...', '..kyyk..', '.kYyywk.', '.kYyywk.', '.kYyyyk.', '.kYyyyk.', '..kYYk..', '...kk...'],
];
write('objects/coin/coin@8x8.png', sheet(coin));

// Slime, 16×16: walk ×2, squashed.
const slime = [
  [
    '................',
    '................',
    '................',
    '................',
    '................',
    '......kkkk......',
    '....kkvvvvkk....',
    '...kvvvvvvvvk...',
    '..kvvwkvvwkvvk..',
    '..kvvwkvvwkvvk..',
    '.kvvvvvvvvvvvvk.',
    '.kvvvvvvvvvvvvk.',
    '.kVvvvvvvvvvvVk.',
    '.kVVVVVVVVVVVVk.',
    '..kkkkkkkkkkkk..',
    '................',
  ],
  [
    '................',
    '................',
    '................',
    '................',
    '................',
    '................',
    '.....kkkkkk.....',
    '...kkvvvvvvkk...',
    '..kvvwkvvwkvvk..',
    '.kvvvwkvvwkvvvk.',
    '.kvvvvvvvvvvvvk.',
    'kvvvvvvvvvvvvvvk',
    'kVvvvvvvvvvvvvVk',
    'kVVVVVVVVVVVVVVk',
    '.kkkkkkkkkkkkkk.',
    '................',
  ],
  [
    '................',
    '................',
    '................',
    '................',
    '................',
    '................',
    '................',
    '................',
    '................',
    '................',
    '................',
    '..kkkkkkkkkkkk..',
    '.kvvkvvvvvvkvvk.',
    'kVVVVVVVVVVVVVVk',
    '.kkkkkkkkkkkkkk.',
    '................',
  ],
];
write('objects/slime/slime@16x16.png', sheet(slime));

// Checkpoint flag, 16×32: lowered (grey) and raised (red).
const pole = (flag, top) =>
  Array.from({ length: 32 }, (_, y) => {
    const row = [...'................'];
    if (y >= 2) row[3] = 'k';
    if (y >= 2) row[4] = 'e';
    if (y === 1) row[3] = row[4] = 'k';
    if (y >= top && y < top + 6)
      for (let x = 5; x < 5 + (6 - Math.abs(y - top - 3)) + 4; x++) row[x] = flag;
    if (y >= 29) for (let x = 1; x < 8; x++) row[x] = y === 29 ? 'k' : 'M';
    return row.join('');
  });
write('objects/checkpoint/checkpoint@16x32.png', sheet([pole('m', 20), pole('r', 3)]));

// Goal, 16×32: a star on a post, two frames of shine.
const goal = (shine) =>
  Array.from({ length: 32 }, (_, y) => {
    const row = [...'................'];
    const star = [
      '.......k........',
      '......kyk.......',
      '......kyk.......',
      '.kkkkkyyykkkkk..',
      '..kyyyywyyyyk...',
      '...kyyywyyyk....',
      '....kyyyyyk.....',
      '...kyyykyyyk....',
      '..kyykk.kkyyk...',
      '..kkk.....kkk...',
    ];
    if (y < star.length)
      return shine && (y === 4 || y === 5) ? star[y].replace(/y/g, 'w') : star[y];
    if (y >= 10) row[7] = 'k';
    if (y >= 10) row[8] = 'e';
    if (y >= 29) for (let x = 3; x < 13; x++) row[x] = y === 29 ? 'k' : 'M';
    return row.join('');
  });
write('objects/goal/goal@16x32.png', sheet([goal(false), goal(true)]));

// Tileset, 16×16 tiles, 8 per row: 1 grass, 2 dirt, 3 plank (one-way), 4–5 water surface
// (animated), 6 stone, 7 bush (decoration), 8 deep water.
const tile = (draw) =>
  Array.from({ length: 16 }, (_, y) => Array.from({ length: 16 }, (_, x) => draw(x, y)).join(''));
const dirt = (x, y) => ((x * 7 + y * 13) % 11 === 0 ? 'D' : 'd');
const tiles = [
  tile((x, y) => (y < 3 ? 'g' : y === 3 ? ((x + 1) % 4 === 0 ? 'g' : 'G') : dirt(x, y))),
  tile(dirt),
  tile((x, y) => (y === 0 ? 'k' : y < 4 ? (x % 8 === 0 ? 'P' : 'p') : y === 4 ? 'k' : '.')),
  tile((x, y) =>
    y < 3 ? '.' : y === 3 || y === 4 ? ((x + (y === 3 ? 0 : 4)) % 8 < 3 ? 'w' : 'c') : 'C',
  ),
  tile((x, y) =>
    y < 3 ? '.' : y === 3 || y === 4 ? ((x + (y === 3 ? 4 : 0)) % 8 < 3 ? 'w' : 'c') : 'C',
  ),
  tile((x, y) =>
    x === 0 || y === 0 ? 'e' : x === 15 || y === 15 ? 'M' : (x + y) % 9 === 0 ? 'M' : 'm',
  ),
  tile((x, y) => {
    const d = (x - 8) ** 2 / 64 + (y - 13) ** 2 / 40;
    return y > 15 ? '.' : d < 0.7 ? ((x + y) % 5 === 0 ? 'g' : 'G') : d < 1 ? 'k' : '.';
  }),
  tile(() => 'C'),
];
const tileRows = [tiles.slice(0, 8)];
const tilePng = new PNG({ width: 128, height: 16 });
tileRows[0].forEach((rows, f) =>
  rows.forEach((row, y) =>
    [...row].forEach((letter, x) => {
      const color = PALETTE[letter];
      const i = (y * 128 + f * 16 + x) * 4;
      if (color) {
        tilePng.data.set(color, i);
        tilePng.data[i + 3] = 255;
      }
    }),
  ),
);
write('scenes/level/assets/tiles.png', PNG.sync.write(tilePng));

// Level 1 as a Tiled JSON map (open it in Tiled to edit): 120 × 17 tiles.
const W = 120;
const H = 17;
const GROUND = 13; // first ground row
const data = new Array(W * H).fill(0);
const set = (x, y, t) => {
  if (x >= 0 && x < W && y >= 0 && y < H) data[y * W + x] = t;
};
const gaps = [
  [22, 25],
  [44, 47],
  [78, 82],
];
const inGap = (x) => gaps.some(([a, b]) => x >= a && x < b);
for (let x = 0; x < W; x++) {
  if (inGap(x)) {
    set(x, GROUND + 1, 4);
    for (let y = GROUND + 2; y < H; y++) set(x, y, 8);
    continue;
  }
  const top = x >= 60 && x < 70 ? GROUND - 2 : GROUND;
  set(x, top, 1);
  for (let y = top + 1; y < H; y++) set(x, y, 2);
}
// Walls at both ends and stone steps.
for (let y = 0; y < GROUND; y++) {
  set(0, y, 6);
  set(W - 1, y, 6);
}
for (const [x, h] of [
  [36, 1],
  [37, 2],
  [90, 1],
  [91, 2],
  [92, 3],
]) {
  for (let i = 1; i <= h; i++) set(x, GROUND - i, 6);
}
// One-way planks.
for (const [x0, x1, y] of [
  [14, 18, 9],
  [21, 26, 8],
  [43, 48, 9],
  [50, 54, 6],
  [77, 83, 9],
  [96, 100, 8],
  [102, 106, 5],
]) {
  for (let x = x0; x < x1; x++) set(x, y, 3);
}
for (const x of [5, 30, 58, 74, 110]) set(x, GROUND - 1, 7);

let id = 1;
const point = (type, x, y, extra = {}) => ({
  id: id++,
  name: '',
  type,
  x: x * 16 + 8,
  y: y * 16,
  width: 0,
  height: 0,
  rotation: 0,
  point: true,
  visible: true,
  ...extra,
});
const objects = [
  point('Start', 3, GROUND),
  ...[7, 8, 9, 15, 16, 17, 22, 23, 24, 25].map((x, i) =>
    point('Coin', x, i < 3 ? GROUND - 1 : i < 6 ? 8 : 7),
  ),
  ...[38, 39, 40, 51, 52, 53, 62, 64, 66, 68].map((x, i) =>
    point('Coin', x, i < 3 ? GROUND - 1 : i < 6 ? 5 : GROUND - 3),
  ),
  ...[78, 80, 82, 97, 98, 99, 103, 104, 105, 112].map((x, i) =>
    point('Coin', x, i < 3 ? 8 : i < 6 ? 7 : i < 9 ? 4 : GROUND - 1),
  ),
  point('Slime', 30, GROUND, { properties: [{ name: 'distance', type: 'float', value: 64 }] }),
  point('Slime', 65, GROUND - 2, { properties: [{ name: 'distance', type: 'float', value: 48 }] }),
  point('Slime', 86, GROUND, { properties: [{ name: 'distance', type: 'float', value: 48 }] }),
  point('Checkpoint', 56, GROUND),
  point('Goal', 115, GROUND),
];
const map = {
  type: 'map',
  version: '1.10',
  tiledversion: '1.11.2',
  orientation: 'orthogonal',
  renderorder: 'right-down',
  width: W,
  height: H,
  tilewidth: 16,
  tileheight: 16,
  infinite: false,
  nextlayerid: 3,
  nextobjectid: id,
  layers: [
    {
      id: 1,
      name: 'ground',
      type: 'tilelayer',
      width: W,
      height: H,
      x: 0,
      y: 0,
      opacity: 1,
      visible: true,
      data,
    },
    {
      id: 2,
      name: 'objects',
      type: 'objectgroup',
      draworder: 'topdown',
      x: 0,
      y: 0,
      opacity: 1,
      visible: true,
      objects,
    },
  ],
  tilesets: [
    {
      firstgid: 1,
      name: 'tiles',
      image: 'tiles.png',
      imagewidth: 128,
      imageheight: 16,
      tilewidth: 16,
      tileheight: 16,
      tilecount: 8,
      columns: 8,
      margin: 0,
      spacing: 0,
      tiles: [
        ...[0, 1, 5].map((id) => ({
          id,
          properties: [{ name: 'solid', type: 'bool', value: true }],
        })),
        { id: 2, properties: [{ name: 'jumpThru', type: 'bool', value: true }] },
        {
          id: 3,
          animation: [
            { tileid: 3, duration: 400 },
            { tileid: 4, duration: 400 },
          ],
          properties: [{ name: 'hazard', type: 'bool', value: true }],
        },
        { id: 4, properties: [{ name: 'hazard', type: 'bool', value: true }] },
        { id: 7, properties: [{ name: 'hazard', type: 'bool', value: true }] },
      ],
    },
  ],
};
write('scenes/level/assets/level-1.json', `${JSON.stringify(map)}\n`);

// Sounds: 16-bit mono PCM WAV.
function wav(seconds, sample) {
  const rate = 22050;
  const count = Math.floor(rate * seconds);
  const pcm = Buffer.alloc(count * 2);
  for (let i = 0; i < count; i++) {
    const t = i / rate;
    pcm.writeInt16LE(Math.round(Math.max(-1, Math.min(1, sample(t, t / seconds))) * 11000), i * 2);
  }
  const header = Buffer.alloc(44);
  header.write('RIFF', 0);
  header.writeUInt32LE(36 + pcm.length, 4);
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
  header.writeUInt32LE(pcm.length, 40);
  return Buffer.concat([header, pcm]);
}
const square = (phase) => (phase % 1 < 0.5 ? 1 : -1);
let phase = 0;
const sweep = (from, to) => (t, k) => {
  phase += (from + (to - from) * k) / 22050;
  return square(phase) * (1 - k) * 0.6;
};
write('scenes/level/assets/jump.wav', wav(0.18, sweep(300, 700)));
phase = 0;
write(
  'scenes/level/assets/coin.wav',
  wav(0.16, (t, k) => square(t * (k < 0.35 ? 988 : 1319)) * (1 - k) * 0.5),
);
phase = 0;
write('scenes/level/assets/stomp.wav', wav(0.14, sweep(220, 60)));
phase = 0;
write('scenes/level/assets/hurt.wav', wav(0.35, sweep(500, 90)));
write(
  'scenes/level/assets/clear.wav',
  wav(
    0.8,
    (t, k) => square(t * [523, 659, 784, 1047][Math.min(3, Math.floor(k * 5))]) * (1 - k) * 0.45,
  ),
);
