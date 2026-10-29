import { describe, expect, it, vi } from 'vitest';
import { resolveAnimations } from '../src/anim/animator';
import { SheetCache } from '../src/anim/sheet-cache';
import { parseAseprite } from '../src/anim/sheets';
import { AssetStore } from '../src/assets';
import { GameObject } from '../src/objects/game-object';
import { testScene } from './helpers';

class Box extends GameObject {
  static override hitbox = { type: 'box' as const, x: -8, y: -8, width: 16, height: 16 };
  note: string | undefined;
}

describe('collision masks', () => {
  it('report only to the side whose mask includes the other layer', () => {
    const scene = testScene();
    const hits: string[] = [];
    class Player extends Box {
      static override collision = { layer: 'player', mask: ['pickup'] };
      override onCollide() {
        hits.push('player');
      }
    }
    class Pickup extends Box {
      static override collision = { layer: 'pickup', mask: [] as string[] };
      override onCollide() {
        hits.push('pickup');
      }
    }
    scene.spawn(Player, { x: 0, y: 0 });
    scene.spawn(Pickup, { x: 4, y: 0 });
    scene.tick();
    expect(hits).toEqual(['player']);
  });

  it('solids only block movers whose mask includes their layer', () => {
    const scene = testScene();
    class Wall extends Box {
      static override collision = { solid: true, layer: 'wall' };
    }
    class Ghost extends Box {
      static override collision = { mask: ['default'] };
    }
    scene.spawn(Wall, { x: 50, y: 0 });
    const ghost = scene.spawn(Ghost, { x: 0, y: 0, velocity: { x: 600, y: 0 } });
    scene.tick(20);
    expect(ghost.x).toBeGreaterThan(100);
  });
});

describe('snapshots', () => {
  it('restore fields that were undefined and refuse another scene', () => {
    const scene = testScene();
    const box = scene.spawn(Box);
    const snapshot = scene.snapshot();
    box.note = 'later';
    scene.restore(snapshot);
    expect(box.note).toBeUndefined();
    expect(() => scene.restore({ ...snapshot, scene: 'other' })).toThrow(/scene "other"/);
  });

  it('call onRestore on re-created objects and keep hitboxes and camera follow', () => {
    const scene = testScene();
    const restored = vi.fn();
    class Rebuilt extends Box {
      override onRestore() {
        restored();
      }
    }
    const object = scene.spawn(Rebuilt);
    object.hitbox = { type: 'circle', radius: 3 };
    scene.camera.follow(object);
    const snapshot = scene.snapshot();
    object.destroy();
    scene.camera.unfollow();
    scene.restore(snapshot);
    const again = scene.find(Rebuilt)!;
    expect(restored).toHaveBeenCalledOnce();
    expect(again.hitbox).toEqual({ type: 'circle', radius: 3 });
    expect(scene.camera.following).toBe(again);
  });
});

describe('sprites', () => {
  it('find grid sheets by convention', async () => {
    const store = new AssetStore({ files: { 'objects/hero/hero@16x16.png': '/h.png' } });
    const cache = new SheetCache(store);
    class Hero extends GameObject {}
    Object.defineProperty(Hero, 'objectPath', { value: 'objects/hero' });
    const load = vi.spyOn(store, 'load').mockResolvedValue();
    await cache.preload(Hero);
    expect(load).toHaveBeenCalledWith(['objects/hero/hero@16x16.png']);
  });

  it('honour Aseprite tag repeat', () => {
    const sheet = parseAseprite({
      frames: [0, 1].map((i) => ({ frame: { x: i * 8, y: 0, w: 8, h: 8 } })),
      meta: { frameTags: [{ name: 'blink', from: 0, to: 1, repeat: '2' }] },
    });
    const blink = resolveAnimations({ animations: { blink: {} } }, sheet).get('blink')!;
    expect(blink.frames).toEqual([0, 1, 0, 1]);
    expect(blink.loop).toBe(false);
  });
});
