// Generates the placeholder art, sounds and video of templates/visual-novel (CC0, made here):
// portraits and gallery images as SVG, sounds as WAV, music and the intro cutscene with ffmpeg
// (WebM VP9 with alpha + Opus, MP4 H.264 + AAC). Run: node e2e/fixtures/generate-visual-novel-assets.mjs
import { execFileSync } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';

const root = join(import.meta.dirname, '../../templates/visual-novel/assets');
const write = (path, data) => {
  mkdirSync(dirname(join(root, path)), { recursive: true });
  writeFileSync(join(root, path), data);
};

// Portraits: a stylized bust, 600×1000. Expressions change eyes, brows and mouth.
const FACES = {
  neutral: {
    eyes: 'M-62 -8h40M22 -8h40',
    brows: 'M-66 -40l42 4M24 -36l42 -4',
    mouth: 'M-22 52h44',
  },
  happy: {
    eyes: 'M-62 -4q20 -18 40 0M22 -4q20 -18 40 0',
    brows: 'M-66 -44l42 -2M24 -46l42 2',
    mouth: 'M-30 44q30 30 60 0',
  },
  smile: {
    eyes: 'M-62 -6h40M22 -6h40',
    brows: 'M-66 -40l42 0M24 -40l42 0',
    mouth: 'M-24 48q24 16 48 0',
  },
  worried: {
    eyes: 'M-62 -6h40M22 -6h40',
    brows: 'M-66 -30l42 -14M24 -44l42 14',
    mouth: 'M-24 58q24 -14 48 0',
  },
  surprised: {
    eyes: 'M-42 -8m-14 0a14 14 0 1 0 28 0a14 14 0 1 0 -28 0M42 -8m-14 0a14 14 0 1 0 28 0a14 14 0 1 0 -28 0',
    brows: 'M-66 -52l42 -6M24 -58l42 6',
    mouth: 'M0 56m-14 0a14 18 0 1 0 28 0a14 18 0 1 0 -28 0',
  },
};
const CHARACTERS = {
  mira: {
    hair: '#e60012',
    coat: '#111111',
    accent: '#ffffff',
    skin: '#f3d6c6',
    expressions: ['neutral', 'happy', 'worried', 'surprised'],
  },
  ren: {
    hair: '#1d1d24',
    coat: '#2f4a8a',
    accent: '#ffd60a',
    skin: '#e9c4a8',
    expressions: ['neutral', 'smile'],
  },
};
for (const [name, c] of Object.entries(CHARACTERS)) {
  for (const expression of c.expressions) {
    const face = FACES[expression];
    write(
      `portraits/${name}-${expression}.svg`,
      `<svg xmlns="http://www.w3.org/2000/svg" width="600" height="1000" viewBox="0 0 600 1000">
  <path d="M60 1000 C80 760 160 640 300 640 C440 640 520 760 540 1000Z" fill="${c.coat}"/>
  <path d="M250 640 L300 760 L350 640Z" fill="${c.accent}"/>
  <rect x="262" y="540" width="76" height="120" fill="${c.skin}"/>
  <ellipse cx="300" cy="400" rx="150" ry="180" fill="${c.skin}"/>
  <path d="M140 420 C120 220 220 170 300 170 C400 170 490 230 462 430 C450 330 400 280 300 300 C220 290 170 330 140 420Z" fill="${c.hair}"/>
  <g transform="translate(300 420)" fill="none" stroke="#111" stroke-width="10" stroke-linecap="round">
    <path d="${face.eyes}"/><path d="${face.brows}" stroke-width="8"/><path d="${face.mouth}" stroke="#7a1d1d"/>
  </g>
</svg>
`,
    );
  }
}

// Gallery images (CG placeholders), 1280×720.
const CG = {
  street: ['#1b2440', '#e60012'],
  rooftop: ['#3a1d4a', '#ffb347'],
  night: ['#0b1026', '#f2f2f2'],
};
for (const [name, [sky, light]] of Object.entries(CG)) {
  const buildings = Array.from({ length: 9 }, (_, i) => {
    const h = 180 + ((i * 97) % 260);
    return `<rect x="${i * 145}" y="${720 - h}" width="130" height="${h}" fill="#000" opacity="0.85"/>`;
  }).join('');
  write(
    `gallery/${name}.svg`,
    `<svg xmlns="http://www.w3.org/2000/svg" width="1280" height="720" viewBox="0 0 1280 720">
  <defs><linearGradient id="g" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${sky}"/><stop offset="1" stop-color="#000"/></linearGradient></defs>
  <rect width="1280" height="720" fill="url(#g)"/>
  <circle cx="980" cy="180" r="90" fill="${light}" opacity="0.9"/>
  ${buildings}
</svg>
`,
  );
}

// Sounds: 16-bit mono WAV at 22 050 Hz.
function wav(seconds, sample) {
  const rate = 22050;
  const count = Math.floor(seconds * rate);
  const data = Buffer.alloc(44 + count * 2);
  data.write('RIFF', 0);
  data.writeUInt32LE(36 + count * 2, 4);
  data.write('WAVEfmt ', 8);
  data.writeUInt32LE(16, 16);
  data.writeUInt16LE(1, 20);
  data.writeUInt16LE(1, 22);
  data.writeUInt32LE(rate, 24);
  data.writeUInt32LE(rate * 2, 28);
  data.writeUInt16LE(2, 32);
  data.writeUInt16LE(16, 34);
  data.write('data', 36);
  data.writeUInt32LE(count * 2, 40);
  let seed = 7;
  const noise = () => ((seed = (seed * 16807) % 2147483647) / 2147483647) * 2 - 1;
  for (let i = 0; i < count; i++) {
    const t = i / rate;
    const v = Math.max(-1, Math.min(1, sample(t, noise)));
    data.writeInt16LE(Math.round(v * 32000), 44 + i * 2);
  }
  return data;
}
write(
  'sfx/chime.wav',
  wav(
    0.9,
    (t) =>
      (Math.sin(2 * Math.PI * 1318 * t) + 0.5 * Math.sin(2 * Math.PI * 1976 * t)) *
      Math.exp(-t * 5) *
      0.5,
  ),
);
write(
  'sfx/wind.wav',
  wav(1.2, (t, noise) => noise() * 0.25 * Math.sin(Math.PI * (t / 1.2))),
);
write(
  'sfx/blip.wav',
  wav(0.04, (t) => Math.sign(Math.sin(2 * Math.PI * 880 * t)) * 0.12 * (1 - t / 0.04)),
);
// A "voice" line: a short melodic murmur standing for recorded speech.
write(
  'voice/mira_01.wav',
  wav(1.4, (t) => {
    const f = 220 + 60 * Math.sin(2 * Math.PI * 3 * t) + 40 * Math.sin(2 * Math.PI * 7 * t);
    return (
      Math.sin(2 * Math.PI * f * t) *
      0.35 *
      Math.min(1, t * 10) *
      Math.min(1, (1.4 - t) * 6) *
      (0.6 + 0.4 * Math.sin(2 * Math.PI * 9 * t))
    );
  }),
);

// Music (8 s loop) and the intro cutscene (4 s): ffmpeg.
const ffmpeg = (args) =>
  execFileSync('ffmpeg', ['-hide_banner', '-loglevel', 'error', '-y', ...args]);
mkdirSync(join(root, 'music'), { recursive: true });
mkdirSync(join(root, 'video'), { recursive: true });
const theme =
  'aevalsrc=0.18*sin(2*PI*220*t)*(0.6+0.4*sin(2*PI*0.5*t))+0.12*sin(2*PI*330*t)+0.08*sin(2*PI*440*t+sin(2*PI*2*t)):s=44100:d=8';
ffmpeg([
  '-f',
  'lavfi',
  '-i',
  theme,
  '-c:a',
  'libvorbis',
  '-q:a',
  '1',
  join(root, 'music/theme.ogg'),
]);
ffmpeg(['-f', 'lavfi', '-i', theme, '-c:a', 'aac', '-b:a', '64k', join(root, 'music/theme.m4a')]);

// A red/black gradient drifting behind a white bar, fading in through its alpha channel.
const picture =
  "gradients=s=640x360:d=4:r=24:c0=0xe60012:c1=0x111111:speed=0.04:seed=3,drawbox=x='40+mod(t*144\\,560)':y=168:w=40:h=24:color=white:t=fill";
const sound = 'aevalsrc=0.2*sin(2*PI*196*t)*exp(-0.4*t):s=44100:d=4';
ffmpeg([
  '-f',
  'lavfi',
  '-i',
  `${picture},format=yuva420p,geq=lum='lum(X,Y)':cb='cb(X,Y)':cr='cr(X,Y)':a='min(255,T*255)'`,
  '-f',
  'lavfi',
  '-i',
  sound,
  '-c:v',
  'libvpx-vp9',
  '-pix_fmt',
  'yuva420p',
  '-b:v',
  '300k',
  '-auto-alt-ref',
  '0',
  '-c:a',
  'libopus',
  '-b:a',
  '48k',
  '-shortest',
  join(root, 'video/intro.webm'),
]);
ffmpeg([
  '-f',
  'lavfi',
  '-i',
  picture,
  '-f',
  'lavfi',
  '-i',
  sound,
  '-c:v',
  'libx264',
  '-pix_fmt',
  'yuv420p',
  '-profile:v',
  'baseline',
  '-b:v',
  '300k',
  '-movflags',
  '+faststart',
  '-c:a',
  'aac',
  '-b:a',
  '64k',
  '-shortest',
  join(root, 'video/intro.mp4'),
]);
console.log(`Visual novel assets written to ${root}`);
