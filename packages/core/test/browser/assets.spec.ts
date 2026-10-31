import { BitmapText, Cache } from 'pixi.js';
import { describe, expect, it, vi } from 'vitest';
import { AssetStore } from '../../src/assets';
import { fileUrl, gridPng, png } from './helpers';

describe('AssetStore (browser loading)', () => {
  it('loads images, JSON and text, then reads them synchronously', async () => {
    const assets = new AssetStore({
      files: {
        'assets/hero.png': gridPng(2, 1, 8),
        'assets/levels/1.json': fileUrl({ name: 'Forest' }),
        'assets/story.ink': fileUrl('Once upon a time', 'text/plain'),
        'assets/readme.bin': fileUrl('ignored', 'application/octet-stream'),
      },
    });
    const progress: [number, number][] = [];
    await assets.load(assets.paths, (done, total) => progress.push([done, total]));
    expect(progress[0]).toEqual([0, 4]);
    expect(progress.at(-1)).toEqual([4, 4]);
    expect(assets.texture('assets/hero.png').width).toBe(16);
    expect(assets.getJson('assets/levels/1.json')).toEqual({ name: 'Forest' });
    expect(assets.getText('assets/story.ink')).toBe('Once upon a time');
    // A file type nobody loads is still "loaded": scenes may list it.
    expect(assets.isLoaded('assets/readme.bin')).toBe(true);
  });

  it('loads each file once, even when asked twice at the same time', async () => {
    const assets = new AssetStore({ files: { 'assets/data.json': fileUrl([1, 2]) } });
    const fetchSpy = vi.spyOn(globalThis, 'fetch');
    await Promise.all([assets.load(['assets/data.json']), assets.load(['assets/data.json'])]);
    await assets.load(['assets/data.json']);
    expect(fetchSpy).toHaveBeenCalledTimes(1);
    fetchSpy.mockRestore();
  });

  it('says how to preload what is read before it is loaded', () => {
    const assets = new AssetStore({
      files: { 'assets/a.png': '', 'assets/a.json': '', 'assets/a.txt': '' },
    });
    const hint =
      /is not loaded. List it in the scene's `static assets` .* or call `await game.assets.load\(\['assets\/a\.\w+'\]\)` first./;
    expect(() => assets.texture('assets/a.png')).toThrow(hint);
    expect(() => assets.getJson('assets/a.json')).toThrow(hint);
    expect(() => assets.getText('assets/a.txt')).toThrow(hint);
    expect(() => assets.get('assets/a.txt')).toThrow(hint);
  });

  it('names close paths when asked to load a file that does not exist', async () => {
    const assets = new AssetStore({ files: { 'assets/hero.png': '' } });
    await expect(assets.load(['assets/hreo.png'])).rejects.toThrow(
      'No asset at "assets/hreo.png". Did you mean "assets/hero.png"?',
    );
  });

  it('cuts images packed into an atlas by a release build', async () => {
    const atlas = png(16, 8, (context) => {
      context.fillStyle = '#f00';
      context.fillRect(0, 0, 8, 8);
      context.fillStyle = '#00f';
      context.fillRect(8, 0, 8, 8);
    });
    const assets = new AssetStore({
      files: {},
      atlases: {
        'assets/red.png': { url: atlas, frame: [0, 0, 8, 8] },
        'assets/blue.png': { url: atlas, frame: [8, 0, 8, 8] },
      },
    });
    expect(assets.has('assets/blue.png')).toBe(true);
    expect(assets.url('assets/blue.png')).toBeUndefined();
    await assets.load(assets.paths);
    const blue = assets.texture('assets/blue.png');
    expect([blue.frame.x, blue.frame.width]).toEqual([8, 8]);
    expect(blue.source).toBe(assets.texture('assets/red.png').source);
  });

  it('loads an AngelCode bitmap font and its page, usable by BitmapText', async () => {
    const fnt = [
      'info face="Pixel" size=8',
      'common lineHeight=8 base=8 scaleW=16 scaleH=8 pages=1',
      'page id=0 file="pixel.png"',
      'chars count=2',
      'char id=65 x=0 y=0 width=8 height=8 xoffset=0 yoffset=0 xadvance=8 page=0 chnl=15',
      'char id=66 x=8 y=0 width=8 height=8 xoffset=0 yoffset=0 xadvance=9 page=0 chnl=15',
    ].join('\n');
    const assets = new AssetStore({
      files: {
        'assets/fonts/pixel.fnt': fileUrl(fnt, 'text/plain'),
        'assets/fonts/pixel.png': gridPng(2, 1, 8),
      },
    });
    await assets.load(['assets/fonts/pixel.fnt']);
    // The page image is loaded with the font.
    expect(assets.isLoaded('assets/fonts/pixel.png')).toBe(true);
    expect(Cache.has('Pixel-bitmap')).toBe(true);
    const text = new BitmapText({ text: 'AB', style: { fontFamily: 'Pixel', fontSize: 8 } });
    expect(text.width).toBe(17);
    text.destroy();
  });

  it('fails to load a font file the browser cannot read', async () => {
    const assets = new AssetStore({
      files: { 'assets/fonts/broken.woff2': fileUrl('not a font', 'font/woff2') },
    });
    await expect(assets.load(['assets/fonts/broken.woff2'])).rejects.toThrow();
  });

  it('hands other file types to registered loaders', async () => {
    const loader = vi.fn(async (path: string, url: string, store: AssetStore) => ({
      path,
      body: await (await fetch(url)).text(),
      same: store,
    }));
    AssetStore.registerLoader(['LVL'], loader);
    const assets = new AssetStore({ files: { 'assets/one.lvl': fileUrl('###', 'text/plain') } });
    await assets.load(['assets/one.lvl']);
    expect(assets.get('assets/one.lvl')).toEqual({
      path: 'assets/one.lvl',
      body: '###',
      same: assets,
    });
  });
});
