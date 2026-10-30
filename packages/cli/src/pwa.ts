// PF-01: the web target is a Progressive Web App. The build writes a web app manifest from
// game.config.ts, icons, and a service worker that precaches every built file, so the game runs
// offline once loaded. Desktop and mobile builds do not get it: their files are already local.

import { createHash } from 'node:crypto';
import { existsSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join, relative, sep } from 'node:path';
import { PNG } from 'pngjs';
import type { Plugin } from 'vite';
import { loadGameConfig } from './project';

/** File names the PWA plugin writes into the build. */
export const PWA_FILES = {
  manifest: 'manifest.webmanifest',
  worker: 'sw.js',
  icons: { 192: 'icons/icon-192.png', 512: 'icons/icon-512.png' },
} as const;

/** The game.config.ts fields the manifest reads. */
export interface PwaGameConfig {
  name: string;
  id: string;
  version: string;
  resolution: { width: number; height: number };
  mobile?: { orientation?: 'portrait' | 'landscape' };
}

/** Web app manifest (the members browsers check for installation). */
export interface WebAppManifest {
  id: string;
  name: string;
  short_name: string;
  start_url: string;
  scope: string;
  display: 'fullscreen';
  display_override: string[];
  orientation: 'portrait' | 'landscape';
  background_color: string;
  theme_color: string;
  icons: { src: string; sizes: string; type: 'image/png'; purpose: string }[];
}

/**
 * Manifest of a game: the reverse-domain id keeps the installed app the same across renames,
 * start URL and scope are relative so the build works from any folder of a web server.
 */
export function webManifest(config: PwaGameConfig): WebAppManifest {
  const { width, height } = config.resolution;
  return {
    id: `./?app=${encodeURIComponent(config.id)}`,
    name: config.name,
    short_name: config.name.length <= 12 ? config.name : config.name.slice(0, 12).trim(),
    start_url: './',
    scope: './',
    display: 'fullscreen',
    display_override: ['fullscreen', 'standalone'],
    orientation: config.mobile?.orientation ?? (width >= height ? 'landscape' : 'portrait'),
    background_color: '#000000',
    theme_color: '#000000',
    icons: ([192, 512] as const).map((size) => ({
      src: PWA_FILES.icons[size],
      sizes: `${size}x${size}`,
      type: 'image/png',
      purpose: 'any',
    })),
  };
}

/** Area-averaged square resize of an RGBA image (icons are only ever scaled down or kept). */
function resize(source: PNG, size: number): PNG {
  const out = new PNG({ width: size, height: size });
  const side = Math.min(source.width, source.height);
  const ox = (source.width - side) / 2;
  const oy = (source.height - side) / 2;
  const scale = side / size;
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const x0 = Math.floor(ox + x * scale);
      const y0 = Math.floor(oy + y * scale);
      const x1 = Math.max(x0 + 1, Math.floor(ox + (x + 1) * scale));
      const y1 = Math.max(y0 + 1, Math.floor(oy + (y + 1) * scale));
      const sum = [0, 0, 0, 0];
      let count = 0;
      for (let sy = y0; sy < y1; sy++) {
        for (let sx = x0; sx < x1; sx++) {
          const i = (sy * source.width + sx) * 4;
          for (let c = 0; c < 4; c++) sum[c]! += source.data[i + c]!;
          count++;
        }
      }
      const o = (y * size + x) * 4;
      for (let c = 0; c < 4; c++) out.data[o + c] = Math.round(sum[c]! / count);
    }
  }
  return out;
}

/** Placeholder icon for games without `icon.png`: a white bulb on black. */
function defaultIcon(size: number): PNG {
  const png = new PNG({ width: size, height: size });
  const s = size / 512;
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const px = x / s;
      const py = y / s;
      const bulb = (px - 256) ** 2 + (py - 250) ** 2 <= 110 ** 2;
      const base =
        px >= 206 && px <= 306 && py >= 340 && py <= 410 && Math.floor(py / 20) % 2 === 1;
      const lit = bulb || base;
      const i = (y * size + x) * 4;
      png.data[i] = png.data[i + 1] = png.data[i + 2] = lit ? 0xf2 : 0x08;
      png.data[i + 3] = 255;
    }
  }
  return png;
}

/**
 * Icons of the manifest, from the game's `icon.png` (the one desktop builds use, 512×512 or
 * larger, square) or a placeholder.
 */
export function pwaIcons(root: string): Record<192 | 512, Buffer> {
  const file = join(root, 'icon.png');
  const source = existsSync(file) ? PNG.sync.read(readFileSync(file)) : undefined;
  const make = (size: number) => PNG.sync.write(source ? resize(source, size) : defaultIcon(size));
  return { 192: make(192), 512: make(512) };
}

/** Every file of a build folder, relative with forward slashes, sorted. */
export function listBuild(outDir: string): string[] {
  const files: string[] = [];
  const walk = (dir: string) => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const path = join(dir, entry.name);
      if (entry.isDirectory()) walk(path);
      else files.push(relative(outDir, path).split(sep).join('/'));
    }
  };
  walk(outDir);
  return files.sort();
}

/** Build version: a hash of every file's path and content. */
export function buildVersion(outDir: string, files: string[]): string {
  const hash = createHash('sha256');
  for (const file of files) {
    hash.update(file);
    hash.update('\0');
    hash.update(readFileSync(join(outDir, file)));
  }
  return hash.digest('hex').slice(0, 16);
}

/**
 * Source of the service worker. Install precaches every file of the build into a cache named
 * after the game id and the build version, activation deletes older versions of the same game,
 * and fetches of the game's own files answer from the cache (with byte ranges for media).
 * Requests to other origins (online features) go to the network untouched, so they fail the way
 * they would without a service worker and the game's own offline handling applies.
 */
export function serviceWorkerSource(options: {
  id: string;
  version: string;
  files: string[];
}): string {
  const prefix = `blacklight:${options.id}:`;
  return `// Generated by the blacklight CLI (PF-01): offline cache of this build.
const PREFIX = ${JSON.stringify(prefix)};
const CACHE = PREFIX + ${JSON.stringify(options.version)};
const FILES = ${JSON.stringify(['./', ...options.files])};

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE).then((cache) =>
      cache.addAll(FILES.map((file) => new Request(file, { cache: 'reload' }))),
    ),
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys.filter((key) => key.startsWith(PREFIX) && key !== CACHE).map((key) => caches.delete(key)),
        ),
      )
      .then(() => self.clients.claim()),
  );
});

async function ranged(request, response) {
  const match = /^bytes=(\\d*)-(\\d*)$/.exec(request.headers.get('range') || '');
  if (!match) return response;
  const body = await response.arrayBuffer();
  const size = body.byteLength;
  const start = match[1] === '' ? Math.max(0, size - Number(match[2])) : Number(match[1]);
  const end = match[1] !== '' && match[2] !== '' ? Math.min(Number(match[2]), size - 1) : size - 1;
  if (start > end || start >= size) {
    return new Response(null, { status: 416, headers: { 'content-range': 'bytes */' + size } });
  }
  const headers = new Headers(response.headers);
  headers.set('content-range', 'bytes ' + start + '-' + end + '/' + size);
  headers.set('content-length', String(end - start + 1));
  return new Response(body.slice(start, end + 1), { status: 206, headers });
}

self.addEventListener('fetch', (event) => {
  const request = event.request;
  if (request.method !== 'GET' || new URL(request.url).origin !== self.location.origin) return;
  event.respondWith(
    (async () => {
      const cache = await caches.open(CACHE);
      const cached =
        (await cache.match(request, { ignoreSearch: true, ignoreVary: true })) ||
        (request.mode === 'navigate' ? await cache.match('./') : undefined);
      if (cached) return request.headers.has('range') ? ranged(request, cached) : cached;
      return fetch(request);
    })(),
  );
});
`;
}

/** Code added to the generated entry of web builds: registers the service worker. */
const REGISTER = `
if ('serviceWorker' in navigator && location.protocol.startsWith('http')) {
  // A failed registration (private mode, blocked storage) leaves the game online-only.
  navigator.serviceWorker.register('./${PWA_FILES.worker}').catch((error) => console.warn('[blacklight] offline cache unavailable:', error));
}
`;

/**
 * Vite plugin of web builds: manifest, icons and theme color in `index.html`, service worker
 * registered by the entry, and `sw.js` written last with the list of every built file.
 */
export function pwa(options: { root: string }): Plugin {
  let outDir = '';
  let config: PwaGameConfig | undefined;
  return {
    name: 'blacklight:pwa',
    apply: 'build',
    async buildStart() {
      config = (await loadGameConfig(options.root)) as unknown as PwaGameConfig;
    },
    configResolved(resolved) {
      outDir = resolved.build.outDir;
    },
    transform(code, id) {
      const file = id.split('?')[0]!.replace(/\\/g, '/');
      if (!file.endsWith('/.blacklight/main.ts')) return undefined;
      return { code: code + REGISTER, map: null };
    },
    transformIndexHtml(html) {
      const tags = `<link rel="manifest" href="./${PWA_FILES.manifest}" />
    <link rel="icon" type="image/png" href="./${PWA_FILES.icons[192]}" />
    <link rel="apple-touch-icon" href="./${PWA_FILES.icons[192]}" />
    <meta name="theme-color" content="#000000" />
    <title>${escapeHtml(config?.name ?? 'Blacklight')}</title>`;
      return html.replace(/<title>[^<]*<\/title>/, tags);
    },
    generateBundle() {
      const icons = pwaIcons(options.root);
      for (const size of [192, 512] as const) {
        this.emitFile({ type: 'asset', fileName: PWA_FILES.icons[size], source: icons[size] });
      }
      this.emitFile({
        type: 'asset',
        fileName: PWA_FILES.manifest,
        source: `${JSON.stringify(webManifest(config!), null, 2)}\n`,
      });
    },
    closeBundle() {
      // After Vite wrote every chunk, asset and public file: the list is the folder itself.
      if (!outDir || !existsSync(outDir)) return;
      const files = listBuild(outDir).filter((file) => file !== PWA_FILES.worker);
      const version = buildVersion(outDir, files);
      writeFileSync(
        join(outDir, PWA_FILES.worker),
        serviceWorkerSource({ id: config!.id, version, files }),
      );
    },
  };
}

function escapeHtml(text: string): string {
  return text.replace(/[&<>"]/g, (c) => `&#${c.charCodeAt(0)};`);
}
