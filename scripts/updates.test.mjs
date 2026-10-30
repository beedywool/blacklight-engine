// PF-08: games update through the stores only. No package ships an updater, no engine code calls
// one, desktop builds publish no update feed (packages/native/test/services.spec.ts) and a web
// build switches to a new version only on the next start (no `skipWaiting`).
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const root = join(import.meta.dirname, '..');

const UPDATERS = [
  'electron-updater',
  'update-electron-app',
  'electron-update-notifier',
  '@capgo/capacitor-updater',
  '@capacitor/live-updates',
  'cordova-plugin-ionic',
  'capacitor-codepush',
];

function files(dir, test, found = []) {
  for (const name of readdirSync(dir)) {
    if (name === 'node_modules' || name === 'dist' || name.startsWith('.')) continue;
    const path = join(dir, name);
    if (statSync(path).isDirectory()) files(path, test, found);
    else if (test(name)) found.push(path);
  }
  return found;
}

describe('updates through the stores only (PF-08)', () => {
  const manifests = ['packages', 'templates', 'servers'].flatMap((dir) =>
    files(join(root, dir), (name) => name === 'package.json'),
  );

  it('no package or template depends on an updater', () => {
    expect(manifests.length).toBeGreaterThan(20);
    for (const file of manifests) {
      const manifest = JSON.parse(readFileSync(file, 'utf8'));
      const deps = Object.keys({
        ...manifest.dependencies,
        ...manifest.devDependencies,
        ...manifest.optionalDependencies,
        ...manifest.peerDependencies,
      });
      expect(
        deps.filter((dep) => UPDATERS.includes(dep)),
        file,
      ).toEqual([]);
    }
  });

  it("no engine code uses Electron's autoUpdater", () => {
    const sources = files(join(root, 'packages'), (name) => /\.(ts|js|mjs|vue)$/.test(name));
    for (const file of sources.filter((f) => f.includes('/src/')))
      expect(readFileSync(file, 'utf8'), file).not.toMatch(/\bautoUpdater\b/);
  });

  it('a web build never swaps versions under a running game', () => {
    expect(readFileSync(join(root, 'packages/cli/src/pwa.ts'), 'utf8')).not.toMatch(/skipWaiting/);
  });
});
