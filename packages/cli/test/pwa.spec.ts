import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { PNG } from 'pngjs';
import { afterEach, describe, expect, it } from 'vitest';
import { buildVersion, listBuild, pwaIcons, serviceWorkerSource, webManifest } from '../src/pwa';
import { createViteConfig } from '../src/vite';

let dir: string;
afterEach(() => {
  if (dir) rmSync(dir, { recursive: true, force: true });
});

const config = {
  name: 'A Rather Long Game Name',
  id: 'com.example.game',
  version: '1.0.0',
  resolution: { width: 1280, height: 720 },
};

describe('webManifest', () => {
  it('meets the installability criteria from game.config.ts', () => {
    const manifest = webManifest(config);
    expect(manifest).toMatchObject({
      id: './?app=com.example.game',
      name: 'A Rather Long Game Name',
      start_url: './',
      scope: './',
      display: 'fullscreen',
      orientation: 'landscape',
    });
    expect(manifest.short_name.length).toBeLessThanOrEqual(12);
    expect(manifest.icons.map((icon) => icon.sizes)).toEqual(['192x192', '512x512']);
  });

  it('follows the mobile orientation, else the resolution', () => {
    expect(webManifest({ ...config, resolution: { width: 720, height: 1280 } }).orientation).toBe(
      'portrait',
    );
    expect(webManifest({ ...config, mobile: { orientation: 'portrait' } }).orientation).toBe(
      'portrait',
    );
  });
});

describe('pwaIcons', () => {
  it('scales icon.png down, or draws a placeholder', () => {
    dir = mkdtempSync(join(tmpdir(), 'blacklight-pwa-'));
    const placeholder = pwaIcons(dir);
    expect(PNG.sync.read(placeholder[512]).width).toBe(512);
    const source = new PNG({ width: 1024, height: 1024 });
    source.data.fill(200);
    writeFileSync(join(dir, 'icon.png'), PNG.sync.write(source));
    const icon = PNG.sync.read(pwaIcons(dir)[192]);
    expect([icon.width, icon.height, icon.data[0]]).toEqual([192, 192, 200]);
  });
});

describe('service worker', () => {
  it('lists every built file and changes version with the content', () => {
    dir = mkdtempSync(join(tmpdir(), 'blacklight-pwa-'));
    mkdirSync(join(dir, 'assets'));
    writeFileSync(join(dir, 'index.html'), '<html></html>');
    writeFileSync(join(dir, 'assets', 'a.js'), 'a');
    const files = listBuild(dir);
    expect(files).toEqual(['assets/a.js', 'index.html']);
    const before = buildVersion(dir, files);
    writeFileSync(join(dir, 'assets', 'a.js'), 'b');
    expect(buildVersion(dir, files)).not.toBe(before);

    const source = serviceWorkerSource({ id: 'com.example.game', version: before, files });
    expect(source).toContain('["./","assets/a.js","index.html"]');
    expect(source).toContain(`"blacklight:com.example.game:"`);
    expect(source).toContain(JSON.stringify(before));
    // Valid JavaScript.
    expect(() => new Function(source)).not.toThrow();
  });
});

describe('createViteConfig', () => {
  it('adds the PWA plugin to web builds only', () => {
    dir = mkdtempSync(join(tmpdir(), 'blacklight-pwa-'));
    writeFileSync(join(dir, 'game.config.ts'), 'export default {};\n');
    const names = (pwa: boolean) =>
      (createViteConfig(dir, { pwa }).plugins as { name: string }[]).map((p) => p.name);
    expect(names(true)).toContain('blacklight:pwa');
    expect(names(false)).not.toContain('blacklight:pwa');
  });
});
