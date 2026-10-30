// Generates the original placeholder art and sounds of templates/party-game (CC0): one SVG card
// per mini-game and short WAV sound effects synthesized from sine waves and seeded noise.
//   node e2e/fixtures/generate-party-game-assets.mjs
import { mkdirSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../../templates/party-game/assets/', import.meta.url));
mkdirSync(`${root}cards`, { recursive: true });
mkdirSync(`${root}sfx`, { recursive: true });

// ---- Cards (300×230, flat shapes in the template's palette) ----

const frame = (background, body) =>
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 300 230" width="300" height="230">` +
  `<rect width="300" height="230" fill="${background}"/>${body}</svg>\n`;

const face = (x, y, r, color) =>
  `<circle cx="${x}" cy="${y}" r="${r}" fill="${color}" stroke="#111" stroke-width="3"/>` +
  `<circle cx="${x - r * 0.32}" cy="${y - r * 0.1}" r="${r * 0.24}" fill="#fff"/>` +
  `<circle cx="${x + r * 0.32}" cy="${y - r * 0.1}" r="${r * 0.24}" fill="#fff"/>` +
  `<circle cx="${x - r * 0.28}" cy="${y - r * 0.06}" r="${r * 0.11}" fill="#111"/>` +
  `<circle cx="${x + r * 0.36}" cy="${y - r * 0.06}" r="${r * 0.11}" fill="#111"/>`;

const spikes = (x, y, r) => {
  let points = '';
  for (let i = 0; i < 20; i++) {
    const a = (i / 20) * Math.PI * 2;
    const d = i % 2 === 0 ? r * 1.35 : r * 0.9;
    points += `${(x + Math.cos(a) * d).toFixed(1)},${(y + Math.sin(a) * d).toFixed(1)} `;
  }
  return `<polygon points="${points.trim()}" fill="#2b2b2b"/><circle cx="${x}" cy="${y}" r="${r}" fill="#8a0f2d" stroke="#111" stroke-width="3"/>`;
};

const cards = {
  'survival-vs': frame(
    '#1d2433',
    `<path d="M0 60H300M0 120H300M0 180H300M60 0V230M120 0V230M180 0V230M240 0V230" stroke="#263047" stroke-width="2"/>` +
      spikes(200, 120, 34) +
      spikes(90, 175, 22) +
      face(85, 80, 24, '#e60012') +
      face(235, 195, 20, '#2f7cf6') +
      `<path d="M150 40 l20 -10 M160 60 l25 -2" stroke="#ffd60a" stroke-width="6"/>`,
  ),
  'air-hockey': frame(
    '#0d1a26',
    `<rect x="14" y="14" width="272" height="202" rx="30" fill="#e8f1f7" stroke="#8fa3b3" stroke-width="5"/>` +
      `<rect x="147" y="14" width="6" height="202" fill="#b8c7d3"/>` +
      `<rect x="0" y="80" width="14" height="70" fill="#e60012"/><rect x="286" y="80" width="14" height="70" fill="#2f7cf6"/>` +
      face(70, 115, 26, '#e60012') +
      face(232, 90, 26, '#2f7cf6') +
      `<circle cx="160" cy="135" r="15" fill="#111" stroke="#ffd60a" stroke-width="4"/>`,
  ),
  'fifty-fifty': frame(
    '#18122b',
    `<rect x="0" y="100" width="146" height="16" fill="#0a0a0a"/><rect x="154" y="100" width="146" height="16" fill="#8b5a2b"/>` +
      `<rect x="146" y="0" width="8" height="116" fill="#ffd60a"/>` +
      face(70, 70, 24, '#f6c445') +
      face(225, 70, 24, '#9b5de5') +
      `<g fill="#6f7390"><circle cx="40" cy="175" r="30"/><circle cx="80" cy="160" r="38"/><circle cx="120" cy="175" r="30"/></g>` +
      `<polygon points="70,190 90,190 78,225 100,225 60,260 72,215 55,215" fill="#ffe14d"/>`,
  ),
  obstacles: frame(
    '#6fbf4a',
    `<rect x="0" y="0" width="60" height="230" fill="#1e78c8"/><rect x="56" y="0" width="6" height="230" fill="#d9c08a"/>` +
      `<rect x="200" y="0" width="34" height="80" fill="#b05a2a" stroke="#3a1a08" stroke-width="3"/>` +
      `<rect x="200" y="160" width="34" height="70" fill="#b05a2a" stroke="#3a1a08" stroke-width="3"/>` +
      face(140, 120, 26, '#3ddc97') +
      face(95, 60, 20, '#ff7a1a'),
  ),
  'hide-and-seek': frame(
    '#3f7a4c',
    face(95, 95, 22, '#ff5fa2') +
      `<rect x="40" y="70" width="90" height="80" rx="10" fill="#2f7cf6" stroke="#111" stroke-width="4"/>` +
      `<rect x="170" y="40" width="90" height="90" rx="10" fill="#f6c445" stroke="#111" stroke-width="4"/>` +
      `<circle cx="200" cy="175" r="26" fill="none" stroke="#111" stroke-width="7"/>` +
      `<circle cx="200" cy="175" r="26" fill="none" stroke="#ffd60a" stroke-width="3"/>` +
      `<circle cx="150" cy="190" r="12" fill="#fff" stroke="#111" stroke-width="3"/>`,
  ),
  'push-push': frame(
    '#1b1420',
    `<circle cx="150" cy="125" r="100" fill="#e9d8b4" stroke="#b2302a" stroke-width="7"/>` +
      face(115, 125, 30, '#c9d1d9') +
      face(190, 115, 30, '#e60012') +
      `<path d="M150 90 l12 -18 M158 100 l20 -10" stroke="#111" stroke-width="5"/>`,
  ),
};
for (const [name, svg] of Object.entries(cards)) writeFileSync(`${root}cards/${name}.svg`, svg);

// ---- Sounds (22 050 Hz, 16-bit mono WAV) ----

const RATE = 22050;
let seed = 0x2f6b1d;
const noise = () => {
  seed = (Math.imul(seed, 1103515245) + 12345) >>> 0;
  return (seed / 0xffffffff) * 2 - 1;
};

/** Renders `seconds` of `sample(t, i)` (−1…1) with a short fade in and out. */
function render(seconds, sample) {
  const count = Math.round(RATE * seconds);
  const data = new Float32Array(count);
  for (let i = 0; i < count; i++) {
    const t = i / RATE;
    const edge = Math.min(1, i / 60, (count - i) / 200);
    data[i] = Math.max(-1, Math.min(1, sample(t, i) * edge));
  }
  return data;
}

function wav(data) {
  const buffer = Buffer.alloc(44 + data.length * 2);
  buffer.write('RIFF', 0);
  buffer.writeUInt32LE(36 + data.length * 2, 4);
  buffer.write('WAVEfmt ', 8);
  buffer.writeUInt32LE(16, 16);
  buffer.writeUInt16LE(1, 20);
  buffer.writeUInt16LE(1, 22);
  buffer.writeUInt32LE(RATE, 24);
  buffer.writeUInt32LE(RATE * 2, 28);
  buffer.writeUInt16LE(2, 32);
  buffer.writeUInt16LE(16, 34);
  buffer.write('data', 36);
  buffer.writeUInt32LE(data.length * 2, 40);
  data.forEach((v, i) => buffer.writeInt16LE(Math.round(v * 32000), 44 + i * 2));
  return buffer;
}

const tone = (f, t) => Math.sin(2 * Math.PI * f * t);
const square = (f, t) => (tone(f, t) >= 0 ? 0.6 : -0.6);
const decay = (t, k) => Math.exp(-t * k);

const sounds = {
  // Three rising beeps then a long one.
  go: render(0.7, (t) => {
    const f = t < 0.45 ? [440, 554, 659][Math.floor(t / 0.15)] : 880;
    const local = t < 0.45 ? t % 0.15 : t - 0.45;
    return square(f, t) * 0.5 * (t < 0.45 ? (local < 0.1 ? 1 : 0) : decay(local, 4));
  }),
  shield: render(
    0.45,
    (t) => (tone(600 + 900 * t, t) * 0.5 + tone(1200 + 1800 * t, t) * 0.2) * decay(t, 5),
  ),
  out: render(0.5, (t) => square(420 - 300 * t, t) * 0.45 * decay(t, 4)),
  finish: render(0.9, (t) => {
    const notes = [523, 659, 784, 1047];
    const n = Math.min(3, Math.floor(t / 0.12));
    return (
      (square(notes[n], t) * 0.35 + tone(notes[n] / 2, t) * 0.3) *
      decay(t - n * 0.12, n === 3 ? 3 : 10)
    );
  }),
  hit: render(0.18, (t) => (noise() * 0.6 + tone(120, t) * 0.6) * decay(t, 22)),
  push: render(0.2, (t) => (noise() * 0.3 + tone(180 - 300 * t, t) * 0.6) * decay(t, 14)),
  goal: render(
    0.8,
    (t) => (square(392, t) * 0.25 + square(523, t) * 0.25 + noise() * 0.15) * decay(t, 3),
  ),
  thunder: render(1.0, (t) => {
    const crack = t < 0.08 ? noise() : 0;
    return (crack * 0.8 + noise() * 0.5 * decay(t, 3) * (0.6 + 0.4 * tone(7, t))) * 0.9;
  }),
  throw: render(0.25, (t) => noise() * 0.35 * (1 - t / 0.25) + tone(300 + 800 * t, t) * 0.2),
  miss: render(0.3, (t) => square(220, t) * 0.35 * decay(t, 8)),
  found: render(0.5, (t) => square(t < 0.12 ? 784 : 1047, t) * 0.35 * decay(t % 0.12, 6)),
  splash: render(0.6, (t) => noise() * 0.6 * decay(t, 6) * (0.5 + 0.5 * tone(30, t))),
};
for (const [name, data] of Object.entries(sounds))
  writeFileSync(`${root}sfx/${name}.wav`, wav(data));

console.log(
  `Wrote ${Object.keys(cards).length} cards and ${Object.keys(sounds).length} sounds to ${root}`,
);
