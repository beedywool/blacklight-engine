import { BitmapText, Text as PixiText, type Particle } from 'pixi.js';
import { describe, expect, it } from 'vitest';
import { Graphics, Text, Video } from '../../src/objects/basic';
import { GameObject } from '../../src/objects/game-object';
import { Particles } from '../../src/objects/particles';
import { TilemapLayer, type TilemapData } from '../../src/objects/tilemap';
import type { Scene } from '../../src/scene';
import { Empty, gridPng, png, scenes, startGame } from './helpers';

async function mainScene(files: Record<string, string> = {}): Promise<Scene<never>> {
  const game = await startGame({ scenes: scenes({ main: Empty }), assets: { files } });
  await game.assets.load(Object.keys(files));
  return game.scene!;
}

// 4 tiles of 8 px in a row: 1 ground, 2 ledge (one-way), 3 slope, 4 water (animated with 1).
const TILES = 'assets/tiles.png';
const map = (tiles: number[], columns = 4): TilemapData => ({
  columns,
  rows: tiles.length / columns,
  tiles,
  tileset: {
    image: TILES,
    tileWidth: 8,
    tileHeight: 8,
    solid: [1, 3],
    jumpThru: [2],
    shapes: {
      3: [
        [0, 8],
        [8, 0],
        [8, 8],
      ],
    },
    animated: { 4: { frames: [4, 1], fps: 10 } },
  },
});

describe('TilemapLayer', () => {
  it('draws a map, reads and changes cells, and maps points to cells', async () => {
    const scene = await mainScene({ [TILES]: gridPng(4, 1, 8) });
    const layer = scene.spawn(TilemapLayer, { x: 16, y: 0, map: map([1, 0, 2, 3, 0, 4, 0, 1]) });
    expect([layer.columns, layer.rows, layer.tileWidth, layer.tileHeight]).toEqual([4, 2, 8, 8]);
    expect(layer.getTile(2, 0)).toBe(2);
    expect(layer.getTile(-1, 0)).toBe(0);
    expect(layer.getTile(0, 5)).toBe(0);
    layer.setTile(1, 0, 1);
    layer.setTile(99, 0, 1); // outside: ignored
    expect(layer.getTile(1, 0)).toBe(1);
    expect(layer.cellAt(16 + 9, 9)).toEqual({ column: 1, row: 1 });
    // The changed map survives a snapshot.
    expect((layer.snapshotState().map as TilemapData).tiles[1]).toBe(1);
  });

  it('blocks objects with solid tiles, one-way tiles and slopes', async () => {
    const scene = await mainScene({ [TILES]: gridPng(4, 1, 8) });
    const layer = scene.spawn(TilemapLayer, { map: map([1, 0, 2, 3, 0, 4, 0, 1]) });
    const shapes = layer.solidShapes({ x: 0, y: 0, width: 32, height: 16 });
    expect(shapes.map((s) => [s.shape.kind, s.jumpThru])).toEqual([
      ['box', false],
      ['box', true],
      ['polygon', false],
      ['box', false],
    ]);
    // Only the tiles under the queried rectangle.
    expect(layer.solidShapes({ x: 0, y: 0, width: 4, height: 4 })).toHaveLength(1);
    // A ray stops at the first solid tile.
    const hit = scene.raycast({ x: 4, y: 12 }, { x: 31, y: 12 });
    expect(hit?.point.x).toBeCloseTo(24);
    layer.destroy();
    expect(layer.solidShapes({ x: 0, y: 0, width: 32, height: 16 })).toEqual([]);
  });

  it('treats every tile as solid in a solid layer without a solid list', async () => {
    const scene = await mainScene({ [TILES]: gridPng(4, 1, 8) });
    const layer = scene.spawn(TilemapLayer, {
      map: {
        columns: 2,
        rows: 1,
        tiles: [4, 0],
        solid: true,
        tileset: { image: 'tiles', tileWidth: 8, tileHeight: 8 },
      },
    });
    expect(layer.solidShapes({ x: 0, y: 0, width: 16, height: 8 })).toHaveLength(1);
    const decor = scene.spawn(TilemapLayer, {
      map: {
        columns: 1,
        rows: 1,
        tiles: [1],
        tileset: { image: 'tiles', tileWidth: 8, tileHeight: 8 },
      },
    });
    expect(decor.solidShapes({ x: 0, y: 0, width: 8, height: 8 })).toEqual([]);
  });

  it('animates tiles on the game clock', async () => {
    const scene = await mainScene({ [TILES]: gridPng(4, 1, 8) });
    const layer = scene.spawn(TilemapLayer, { map: map([4, 4, 0, 0]) });
    const water = () =>
      layer.children.flatMap((c) => c.children).filter((c) => 'texture' in c) as unknown as {
        texture: { frame: { x: number } };
      }[];
    const before = water().map((s) => s.texture.frame.x);
    expect(before).toEqual([24, 24]);
    scene.game.step(9); // 150 ms at 10 fps: the second frame (tile 1)
    expect(water().map((s) => s.texture.frame.x)).toEqual([0, 0]);
    // Redrawing the chunk keeps one sprite per animated tile.
    layer.setTile(0, 0, 0);
    expect(water()).toHaveLength(1);
  });

  it('redraws when a snapshot with other tiles is restored', async () => {
    const scene = await mainScene({ [TILES]: gridPng(4, 1, 8) });
    const layer = scene.spawn(TilemapLayer, { map: map([1, 1, 1, 1]) });
    const saved = layer.snapshotState();
    layer.setTile(0, 0, 0);
    layer.restoreState(saved);
    expect(layer.getTile(0, 0)).toBe(1);
    layer.restoreState({});
    expect(layer.getTile(0, 0)).toBe(1);
  });

  it('refuses a map whose tile count does not match its size', async () => {
    const scene = await mainScene({ [TILES]: gridPng(4, 1, 8) });
    const layer = scene.spawn(TilemapLayer);
    expect(() => layer.load({ ...map([1, 1, 1, 1]), rows: 2 })).toThrow(
      'Tilemap has 4 tiles; columns × rows is 8.',
    );
  });
});

describe('Particles', () => {
  it('bursts particles that move, fade and die after their lifetime', async () => {
    const scene = await mainScene();
    const sparks = scene.spawn(Particles, { x: 100, y: 100 });
    sparks.configure({ rate: 0, lifetime: 100, speed: 60, angle: 0, alpha: [1, 0], scale: [1, 3] });
    sparks.burst(5);
    expect(sparks.count).toBe(5);
    scene.game.step(3); // 50 ms: half-way
    const particle = sparks.container.particleChildren[0] as Particle;
    expect(particle.x).toBeCloseTo(3);
    expect(particle.alpha).toBeCloseTo(0.5);
    expect(particle.scaleX).toBeCloseTo(2);
    scene.game.step(4);
    expect(sparks.count).toBe(0);
  });

  it('emits at its rate while emitting, up to max', async () => {
    const scene = await mainScene();
    const smoke = scene.spawn(Particles);
    smoke.configure({ rate: 60, max: 10, lifetime: 10_000 });
    scene.game.step(30);
    expect(smoke.count).toBe(10);
    smoke.configure({ rate: 60, emitting: false, lifetime: 10_000 });
    expect(smoke.emitting).toBe(false);
  });

  it('replays the same way from the same seed', async () => {
    const positions = async () => {
      const scene = await mainScene();
      const confetti = scene.spawn(Particles);
      confetti.configure({
        rate: 0,
        area: { width: 50, height: 20 },
        spin: [0, 90],
        gravity: { x: 0, y: 100 },
        tint: [0xff0000, 0x0000ff],
        additive: true,
      });
      confetti.burst(3);
      const ring = scene.spawn(Particles);
      ring.configure({ rate: 0, area: 10, tint: 0x00ff00 });
      ring.burst(2);
      scene.game.step(2);
      expect(confetti.container.blendMode).toBe('add');
      const all = [...confetti.container.particleChildren, ...ring.container.particleChildren];
      return (all as Particle[]).map((p) => [p.x, p.y, p.tint]);
    };
    expect(await positions()).toEqual(await positions());
  });

  it('draws a texture by key and keeps its options in snapshots', async () => {
    const scene = await mainScene({ 'assets/spark.png': png(4, 4, (c) => c.fillRect(0, 0, 4, 4)) });
    const sparks = scene.spawn(Particles);
    sparks.configure({ texture: 'spark', rate: 0 });
    sparks.burst(1);
    expect(sparks.container.particleChildren[0]!.texture.width).toBe(4);
    const state = sparks.snapshotState();
    sparks.restoreState({ options: { rate: 5 }, emitting: false });
    expect(sparks.options.rate).toBe(5);
    sparks.restoreState(state);
    expect(sparks.options.texture).toBe('spark');
  });
});

describe('Text', () => {
  it('shows strings and numbers, renders at the screen resolution and switches to bitmap', async () => {
    const scene = await mainScene();
    const score = scene.spawn(Text, { text: 'Score', style: { fontSize: 12, fill: 0xffffff } });
    expect(score.view).toBeInstanceOf(PixiText);
    // The 640×360 mount shows the 320×180 design area at scale 2.
    expect((score.view as PixiText).resolution).toBe(scene.game.textResolution);
    score.text = 42;
    expect(score.text).toBe('42');
    score.style = { fontSize: 20 };
    expect(score.style.fontSize).toBe(20);
    score.anchor.set(0, 1);

    score.bitmap = true;
    expect(score.view).toBeInstanceOf(BitmapText);
    expect(score.text).toBe('42');
    expect(score.anchor.y).toBe(1);
    score.bitmap = true;
    score.restoreState({ text: 'restored' });
    expect(score.snapshotState()).toEqual({ text: 'restored' });
  });

  it('uses bitmap fonts for every instance of a class that asks for them', async () => {
    class Damage extends Text {
      static override bitmap = true;
    }
    const scene = await mainScene();
    expect(scene.spawn(Damage, { text: '12' }).bitmap).toBe(true);
  });
});

describe('Graphics', () => {
  it('uses the bounds of what it draws as its hitbox', async () => {
    const scene = await mainScene();
    const wall = scene.spawn(Graphics, { x: 10, y: 20 });
    wall.draw.rect(0, 0, 40, 8).fill(0x303030);
    expect(wall.worldShape()).toEqual({
      kind: 'box',
      rect: { x: 10, y: 20, width: 40, height: 8 },
    });
  });
});

describe('Video', () => {
  it('offers every format of the video to the browser, with its type', async () => {
    const scene = await mainScene({
      'assets/intro.webm': 'data:video/webm;base64,',
      'assets/intro.mp4': 'data:video/mp4;base64,',
    });
    const intro = scene.spawn(Video, { source: 'intro', loop: true });
    const element = intro.element!;
    expect(element.loop).toBe(true);
    expect(element.muted).toBe(true);
    expect([...element.querySelectorAll('source')].map((s) => s.type).sort()).toEqual([
      'video/mp4',
      'video/webm',
    ]);
    expect(intro.ended).toBe(false);
    intro.pause();
    expect(intro.snapshotState()).toMatchObject({ source: 'intro', loop: true, time: 0 });
    intro.restoreState({ source: 'intro', loop: false, muted: true, time: 0 });
    expect(intro.loop).toBe(false);
    intro.destroy();
    expect(element.paused).toBe(true);
  });

  it('does nothing before a source is set', async () => {
    const scene = await mainScene();
    const video = scene.spawn(Video);
    await expect(video.play()).resolves.toBeUndefined();
    expect(video.ended).toBe(false);
    expect(video.snapshotState()).toMatchObject({ time: 0 });
  });
});

describe('GameObject in a running scene', () => {
  it('draws at interpolated positions between steps', async () => {
    const scene = await mainScene();
    const ball = scene.spawn(GameObject, { x: 0, y: 0 });
    ball.velocity.set(60, 0);
    scene.game.step(1);
    expect(ball.x).toBeCloseTo(1);
    scene.draw(0.5);
    // `x` and `position` are the logic position; Pixi draws half-way.
    expect(ball.position.x).toBeCloseTo(1);
    ball.updateLocalTransform();
    expect(ball.localTransform.tx).toBeCloseTo(0.5);
    // Moving through Pixi's position also slides from the previous step's position.
    scene.game.step(1);
    ball.position.set(101, 0);
    scene.draw(0.5);
    ball.updateLocalTransform();
    expect(ball.localTransform.tx).toBeCloseTo(51);
  });
});
