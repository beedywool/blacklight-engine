import { describe, expect, it, vi } from 'vitest';
import type { AssetManifest } from '../../src/assets';
import type { ObjectRegistry } from '../../src/registry';
import { Sprite } from '../../src/objects/sprite';
import type { GameObject } from '../../src/objects/game-object';
import type { Scene } from '../../src/scene';
import { Empty, fileUrl, gridPng, png, scenes, startGame } from './helpers';

/** A game whose `main` scene has the given scene-local objects and files. */
async function gameWith(objects: Record<string, typeof GameObject>, files: AssetManifest['files']) {
  const registry: ObjectRegistry = { global: {}, scenes: { main: {} } };
  for (const [name, type] of Object.entries(objects)) {
    registry.scenes.main![name] = {
      path: type.objectPath!,
      load: () => Promise.resolve({ default: type as never }),
    };
  }
  const game = await startGame({
    scenes: scenes({ main: Empty }),
    objects: registry,
    assets: { files },
  });
  return { game, scene: game.scene as Scene<never> };
}

// A 4×1 grid of 16 px frames; the last frame is transparent except for its left half.
const strip = () =>
  png(64, 16, (context) => {
    context.fillStyle = '#f00';
    context.fillRect(0, 0, 48, 16);
    context.fillRect(48, 0, 8, 16);
  });

describe('Sprite', () => {
  it('finds a grid sheet by convention and plays every frame as the default animation', async () => {
    class Hero extends Sprite {
      static override objectPath = 'scenes/main/objects/hero';
    }
    const { game, scene } = await gameWith(
      { Hero },
      { 'scenes/main/objects/hero/hero@16x16.png': gridPng(4, 1, 16) },
    );
    const hero = scene.spawn(Hero, { x: 100, y: 50 });
    expect(hero.animationNames).toEqual(['default']);
    expect(hero.animation).toBe('default');
    expect(hero.texture.frame.width).toBe(16);
    // The default rate is 10 fps: six steps at 60 Hz show the next frame.
    game.step(6);
    expect(hero.frame).toBe(1);
    // Auto hitbox: the frame around the anchor.
    expect(hero.worldShape()).toEqual({
      kind: 'box',
      rect: { x: 92, y: 42, width: 16, height: 16 },
    });
  });

  it('plays named animations from an animation file, with frame and end events', async () => {
    class Bat extends Sprite {
      static override objectPath = 'scenes/main/objects/bat';
      static override animations = {
        source: './bat@16x16.png',
        default: 'idle',
        animations: {
          idle: { frames: [0] },
          'fly-right': { frames: { from: 1, to: 3 }, fps: 60, events: { '1': 'flap' } },
          attack: { frames: [2, 3], fps: 60, loop: false, next: 'idle' },
        },
      };
    }
    const { game, scene } = await gameWith(
      { Bat },
      { 'scenes/main/objects/bat/bat@16x16.png': gridPng(4, 1, 16) },
    );
    const bat = scene.spawn(Bat);
    expect(bat.animation).toBe('idle');
    const flaps = vi.fn();
    const ends = vi.fn();
    const stopFlaps = bat.onFrame('flap', flaps);
    bat.onEnd(ends);

    bat.play('fly-right' as never, { speed: 1 });
    game.step(1);
    // Events are keyed by the frame within the animation; listeners get the sheet frame shown.
    expect(flaps).toHaveBeenCalledWith(2);
    stopFlaps();

    // A missing direction falls back to the mirrored one, with a warning.
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    bat.play('fly-left' as never);
    expect(bat.animation).toBe('fly-right');
    expect(bat.view.scale.x).toBe(-1);
    expect(warn).toHaveBeenCalledOnce();
    warn.mockRestore();
    bat.flipX = true; // a mirrored animation flipped again faces right
    expect(bat.view.scale.x).toBe(1);
    bat.flipY = true;
    expect(bat.view.scale.y).toBe(-1);

    bat.play('attack' as never, { restart: true });
    game.step(3);
    expect(ends).toHaveBeenCalledWith('attack');
    expect(bat.animation).toBe('idle');
    ends.mockClear();
    bat.play('attack' as never).queue('fly-right' as never);
    game.step(3);
    expect(bat.animation).toBe('fly-right');
    // The queued animation starts after the end of the one before it, not instead of it.
    expect(ends.mock.calls).toEqual([['attack']]);
    // play() interrupts without an end.
    bat.play('attack' as never, { restart: true });
    game.step(1);
    bat.play('idle' as never);
    game.step(3);
    expect(ends.mock.calls).toEqual([['attack']]);

    expect(bat.snapshotState()).toEqual({ flipX: true, flipY: true });
    bat.restoreState({ flipX: false, flipY: false });
    expect(bat.flipX).toBe(false);
  });

  it('reads Aseprite exports: trimmed frames, tags, pivots and a hitbox slice', async () => {
    class Knight extends Sprite {
      static override objectPath = 'scenes/main/objects/knight';
    }
    const frame = (x: number) => ({
      frame: { x, y: 0, w: 16, h: 16 },
      duration: 100,
      trimmed: true,
      sourceSize: { w: 32, h: 32 },
      spriteSourceSize: { x: 8, y: 16, w: 16, h: 16 },
    });
    const json = {
      frames: [frame(0), frame(16), frame(32)],
      meta: {
        image: 'sheet.png',
        frameTags: [
          { name: 'stand', from: 0, to: 0 },
          { name: 'walk', from: 1, to: 2 },
        ],
        slices: [
          {
            name: 'hitbox',
            keys: [{ frame: 0, bounds: { x: 4, y: 16, w: 12, h: 16 }, pivot: { x: 12, y: 16 } }],
          },
        ],
      },
    };
    const { scene } = await gameWith(
      { Knight },
      {
        'scenes/main/objects/knight/knight.aseprite.json': fileUrl(json),
        'scenes/main/objects/knight/sheet.png': gridPng(3, 1, 16),
      },
    );
    const knight = scene.spawn(Knight, { x: 0, y: 0 });
    expect(knight.animationNames).toEqual(['stand', 'walk']);
    // Untrimmed size from sourceSize; the slice pivot (16, 32 in the frame) sits on the position.
    expect(knight.texture.orig.width).toBe(32);
    expect(knight.anchor.x).toBeCloseTo(16 / 32);
    expect(knight.anchor.y).toBeCloseTo(32 / 32);
    // The "hitbox" slice gives the box, relative to the anchor.
    expect(knight.worldShape()).toEqual({
      kind: 'box',
      rect: { x: -12, y: -16, width: 12, height: 16 },
    });
    // Mirrored with the sprite.
    knight.flipX = true;
    expect(knight.worldShape()).toEqual({
      kind: 'box',
      rect: { x: 0, y: -16, width: 12, height: 16 },
    });
  });

  it('uses the opaque pixels of the frame as a pixel hitbox', async () => {
    class Ghost extends Sprite {
      static override objectPath = 'scenes/main/objects/ghost';
      static override hitbox = 'pixel' as const;
      static override animations = {
        source: './ghost@16x16.png',
        animations: { last: { frames: [3] } },
      };
    }
    class Dot extends Sprite {
      static override objectPath = 'scenes/main/objects/dot';
      static override hitbox = { type: 'box' as const, width: 2, height: 2, x: -1, y: -1 };
    }
    const { scene } = await gameWith(
      { Ghost, Dot },
      { 'scenes/main/objects/ghost/ghost@16x16.png': strip() },
    );
    const ghost = scene.spawn(Ghost, { x: 100, y: 100 });
    const shape = ghost.worldShape();
    expect(shape?.kind).toBe('pixel');
    const left = scene.spawn(Dot, { x: 94, y: 100 });
    const right = scene.spawn(Dot, { x: 105, y: 100 });
    // Only the left half of the frame is opaque.
    expect(ghost.overlaps(left)).toBe(true);
    expect(ghost.overlaps(right)).toBe(false);
    ghost.flipX = true;
    expect(ghost.overlaps(left)).toBe(false);
    expect(ghost.overlaps(right)).toBe(true);
  });

  it('shows a single image and swaps textures by key', async () => {
    class Crate extends Sprite {
      static override objectPath = 'scenes/main/objects/crate';
      static override texture = 'crate';
    }
    const { scene } = await gameWith(
      { Crate },
      {
        'scenes/main/objects/crate/crate.png': png(20, 10, (c) => c.fillRect(0, 0, 20, 10)),
        'scenes/main/objects/crate/crate-open.png': png(30, 10, (c) => c.fillRect(0, 0, 30, 10)),
      },
    );
    await scene.game.assets.load(['scenes/main/objects/crate/crate-open.png']);
    const crate = scene.spawn(Crate);
    expect(crate.texture.frame.width).toBe(20);
    crate.setTexture('./crate-open.png');
    expect(crate.texture.frame.width).toBe(30);
    expect(crate.animator?.paused).toBe(true);
  });

  it('says how to give a sprite without a sheet its animations', async () => {
    class Blank extends Sprite {}
    const { scene } = await gameWith({}, {});
    const blank = scene.spawn(Blank);
    expect(blank.animation).toBeUndefined();
    expect(blank.frame).toBe(0);
    expect(blank.worldShape()).toBeUndefined();
    expect(() => blank.play('run' as never)).toThrow(
      'Blank has no animations to play "run". Give it a sheet or an .anim.json.',
    );
  });
});

describe('SheetCache', () => {
  it('shares one sheet between classes with the same source and file', async () => {
    class A extends Sprite {
      static override objectPath = 'scenes/main/objects/a';
      static override texture = '@assets/shared@8x8.png';
    }
    class B extends Sprite {
      static override objectPath = 'scenes/main/objects/b';
      static override texture = '@assets/shared@8x8.png';
    }
    const { game } = await gameWith({ A, B }, { 'assets/shared@8x8.png': gridPng(2, 2, 8) });
    expect(game.sheets.get(A)).toBe(game.sheets.get(B));
    expect(game.sheets.get(A)!.textures).toHaveLength(4);
  });

  it('refuses a JSON source that is not an Aseprite export', async () => {
    class Bad extends Sprite {
      static override objectPath = 'scenes/main/objects/bad';
    }
    await expect(
      gameWith({ Bad }, { 'scenes/main/objects/bad/bad.json': fileUrl({ hello: 1 }) }),
    ).rejects.toThrow(
      'scenes/main/objects/bad/bad.json is not an Aseprite JSON export (it needs "frames" and "meta").',
    );
  });

  it('explains that a sheet must be preloaded before a sprite reads it', async () => {
    class Late extends Sprite {
      static override objectPath = 'objects/late';
    }
    const { game } = await gameWith(
      {},
      {
        'objects/late/late.aseprite.json': fileUrl({ frames: [], meta: {} }),
        'objects/late/late.png': gridPng(1, 1, 8),
      },
    );
    expect(() => game.sheets.get(Late)).toThrow(
      "Late's sprite sheet is not loaded. Put the object in objects/ or scenes/<scene>/objects/ so it is preloaded.",
    );
  });

  it('loads the extra assets a class lists, even without a sheet', async () => {
    class Talker extends Sprite {
      static override objectPath = 'scenes/main/objects/talker';
      static override assets = ['./lines.txt'];
    }
    const { game } = await gameWith(
      { Talker },
      { 'scenes/main/objects/talker/lines.txt': fileUrl('hello', 'text/plain') },
    );
    expect(game.assets.getText('scenes/main/objects/talker/lines.txt')).toBe('hello');
    expect(game.sheets.get(Talker)).toBeUndefined();
  });
});
