import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { PNG } from 'pngjs';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { buildAtlases, pack, pngSize } from '../src/atlas';
import { scanAnimations, scanAssets, scanObjects, scanScenes, typesFile } from '../src/project';
import { manifestModule } from '../src/vite';

function png(width: number, height: number, color: [number, number, number, number]): Buffer {
  const image = new PNG({ width, height });
  for (let i = 0; i < width * height; i++) image.data.set(color, i * 4);
  return PNG.sync.write(image);
}

let root: string;
beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), 'blacklight-project-'));
  const file = (path: string, content: string | Buffer) => {
    mkdirSync(join(root, path, '..'), { recursive: true });
    writeFileSync(join(root, path), content);
  };
  file('game.config.ts', 'export default {};');
  file('scenes/level/level.scene.ts', '');
  file('scenes/level/objects/shadow/shadow.object.ts', '');
  file('scenes/level/assets/hit.wav', 'x');
  file('objects/big-hero/big-hero.object.ts', '');
  file(
    'objects/big-hero/big-hero.anim.json',
    JSON.stringify({ animations: { idle: {}, run: {} } }),
  );
  file(
    'objects/big-hero/big-hero.aseprite.json',
    JSON.stringify({ frames: [], meta: { frameTags: [{ name: 'jump' }] } }),
  );
  file('objects/big-hero/big-hero.png', png(4, 4, [255, 0, 0, 255]));
  file('assets/coin.png', png(2, 2, [0, 255, 0, 255]));
  file('assets/notes.md', 'not an asset');
});
afterEach(() => rmSync(root, { recursive: true, force: true }));

describe('project scan', () => {
  it('finds assets, scenes, objects and animation names', () => {
    expect(scanAssets(root)).toEqual([
      'assets/coin.png',
      'objects/big-hero/big-hero.aseprite.json',
      'objects/big-hero/big-hero.png',
      'scenes/level/assets/hit.wav',
    ]);
    expect(scanScenes(root)).toEqual(['level']);
    expect(scanObjects(root)).toEqual(['BigHero', 'Shadow']);
    expect(scanAnimations(root)).toEqual(['idle', 'jump', 'run']);
  });

  it('writes the Register types', () => {
    const types = typesFile(root, ['jump', 'left']);
    expect(types).toContain('scenes: "level";');
    expect(types).toContain('objects: "BigHero" | "Shadow";');
    expect(types).toContain('actions: "jump" | "left";');
    expect(types).toContain('"coin"');
  });
});

describe('atlases', () => {
  it('packs on shelves and opens new pages', () => {
    const { placements, pages } = pack(
      [
        { id: 'a', width: 70, height: 60 },
        { id: 'b', width: 70, height: 30 },
        { id: 'c', width: 70, height: 60 },
      ],
      128,
      2,
    );
    expect(pages).toHaveLength(2);
    expect(placements.find((p) => p.id === 'a')).toEqual({ id: 'a', page: 0, x: 2, y: 2 });
    expect(() => pack([{ id: 'big', width: 200, height: 10 }], 128)).toThrow(/does not fit/);
  });

  it('copies pixels and extrudes edges', () => {
    const { pages, frames } = buildAtlases(
      [{ id: 'red', data: png(2, 2, [255, 0, 0, 255]) }],
      64,
      2,
    );
    const page = PNG.sync.read(pages[0]!);
    const [x, y] = frames.get('red')!.frame;
    expect([...page.data.subarray((y * page.width + x) * 4, (y * page.width + x) * 4 + 4)]).toEqual(
      [255, 0, 0, 255],
    );
    expect(page.data[0]).toBe(255); // corner of the padding holds the extruded edge
    expect(pngSize(pages[0]!)).toEqual({ width: page.width, height: page.height });
  });

  it('lists packed images as atlas frames in release builds', () => {
    const dev = manifestModule(root);
    expect(dev).toContain('"assets/coin.png": a0');
    const emitted: string[] = [];
    const release = manifestModule(root, (name) => {
      emitted.push(name);
      return 'REF';
    });
    expect(emitted).toEqual(['atlas-0.png']);
    expect(release).toContain('"assets/coin.png": { url: import.meta.ROLLUP_FILE_URL_REF');
    expect(release).not.toContain('coin.png?url');
  });
});
