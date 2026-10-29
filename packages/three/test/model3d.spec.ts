import { readFileSync } from 'node:fs';
import { beforeAll, describe, expect, it } from 'vitest';
import { Sprite as PixiSprite } from 'pixi.js';
import { SkinnedMesh } from 'three';
import { AssetStore, Scene } from '@blacklight/core';
import { testScene } from './helpers';
import { Model3D, type Layers3D, type LoadedModel } from '../src/index';
import { parseModel } from '../src/loader';

let robot: LoadedModel;
const assets = new AssetStore({
  files: { 'models/hero.glb': '/hero.glb', 'objects/bot/bot.glb': '/bot.glb' },
});

beforeAll(async () => {
  const bytes = readFileSync(
    new URL('../../../templates/2d-with-3d/models/hero.glb', import.meta.url),
  );
  robot = await parseModel(
    bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer,
    'models/hero.glb',
  );
  // Node has no fetch for game URLs: this store hands out the parsed file.
  AssetStore.registerLoader(['glb'], () => Promise.resolve(robot));
  await assets.load(['models/hero.glb', 'objects/bot/bot.glb']);
});

class Robot extends Model3D {
  static override model = '@models/hero.glb';
  static override animations = { wave: { loop: false, next: 'idle' } };
  meshes = 0;
  override create() {
    this.object3d.traverse((node) => {
      if (node instanceof SkinnedMesh) this.meshes++;
    });
  }
}

function sceneWith<S extends Scene<never>>(SceneClass?: new () => S) {
  return testScene(assets, SceneClass);
}

describe('Model3D', () => {
  it('preloads its model with the scene, from `static model` or its folder', () => {
    expect(Robot.requiredAssets()).toEqual(['@models/hero.glb']);
    class Bot extends Model3D {}
    Bot.objectPath = 'objects/bot';
    expect(Bot.requiredAssets()).toEqual(['./bot']);
    class Loose extends Model3D {}
    expect(Loose.requiredAssets()).toEqual([]);
  });

  it('shows the preloaded model, ready in create(), and plays its first clip', () => {
    const scene = sceneWith();
    const robot3d = scene.spawn(Robot, { x: 100, y: 200 });
    expect(robot3d.meshes).toBe(1);
    expect(robot3d.animation).toBe('idle');
    expect(robot3d.animationNames).toEqual(['idle', 'walk', 'wave']);
    robot3d.play('walk');
    scene.tick(30);
    expect(robot3d.animation).toBe('walk');
    expect(robot3d.animator!.time).toBeCloseTo(0.5, 1);
  });

  it('finds a model named after its folder', () => {
    class Bot extends Model3D {}
    Bot.objectPath = 'objects/bot';
    const bot = sceneWith().spawn(Bot);
    expect(bot.loaded?.path).toBe('models/hero.glb');
    expect(bot.animationNames).toHaveLength(3);
  });

  it('chains animations and reports their end on the game clock', () => {
    const scene = sceneWith();
    const robot3d = scene.spawn(Robot);
    const ended: string[] = [];
    robot3d.onEnd((name) => ended.push(name));
    robot3d.play('wave', { fade: 0 });
    scene.tick(120);
    expect(ended).toEqual(['wave']);
    expect(robot3d.animation).toBe('idle');
  });

  it('collides with the box of its model, scaled by pixelsPerUnit', () => {
    const robot3d = sceneWith().spawn(Robot, { x: 300, y: 400 });
    const shape = robot3d.worldShape() as { kind: string; rect: { y: number; height: number } };
    expect(shape.kind).toBe('box');
    // Feet at the object's position, head 1.85 units (185 px) above.
    expect(shape.rect.y + shape.rect.height).toBeCloseTo(400, -1);
    expect(shape.rect.y).toBeCloseTo(215, -1);
  });

  it('takes camera and lights from its layer, or its own view', () => {
    class Arena extends Scene {
      static override layers = ['back', 'actors'];
      static layers3d: Layers3D = { actors: { camera: 'perspective', fov: 25, ambient: 0.3 } };
    }
    const scene = sceneWith(Arena);
    const actor = scene.spawn(Robot, { layer: 'actors' });
    expect(actor.view.camera).toEqual({ type: 'perspective', fov: 25 });
    expect(actor.view.ambient.intensity).toBe(0.3);
    expect(scene.spawn(Robot, { layer: 'back' }).view.camera.type).toBe('orthographic');
    class Own extends Robot {
      static override view = { camera: 'perspective' as const, sun: false as const };
    }
    const own = scene.spawn(Own, { layer: 'actors' });
    expect(own.view).not.toBe(actor.view);
    expect(own.view.sun.visible).toBe(false);
    expect(scene.spawn(Robot, { layer: 'hud' }).view).not.toBe(actor.view);
  });

  it('saves its 3D rotation, depth and animation in snapshots', () => {
    const scene = sceneWith();
    scene.game.rememberClass(Robot);
    const robot3d = scene.spawn(Robot);
    robot3d.rotation3d.y = 1.2;
    robot3d.z = 40;
    robot3d.play('walk', { fade: 0 });
    scene.tick(12);
    const snapshot = scene.snapshot();
    robot3d.rotation3d.y = 0;
    robot3d.z = 0;
    robot3d.play('idle', { fade: 0 });
    scene.tick(30);
    scene.restore(snapshot);
    expect(robot3d.rotation3d.y).toBeCloseTo(1.2);
    expect(robot3d.z).toBe(40);
    expect(robot3d.animation).toBe('walk');
    expect(robot3d.animator!.time).toBeCloseTo(0.2, 2);
  });

  it('draws into a texture shown by a sprite in render-to-texture mode', () => {
    class Portrait extends Robot {
      static override renderToTexture = { width: 200, height: 160 };
    }
    const portrait = sceneWith().spawn(Portrait, { x: 50, y: 50 });
    expect(portrait.children[0]).toBeInstanceOf(PixiSprite);
    // Without a renderer (tests) drawing is skipped; the model still animates.
    portrait.interpolate(1, false);
    portrait.play('walk');
    expect(portrait.animation).toBe('walk');
  });

  it('explains a missing model', () => {
    class Empty extends Model3D {}
    Empty.objectPath = 'objects/empty';
    expect(() => sceneWith().spawn(Empty).play('idle')).toThrow(
      /Empty has no model file\. Put a \.glb named after its folder next to it/,
    );
    class Unspawned extends Model3D {}
    expect(() => new Unspawned().play('idle')).toThrow(/has no model to animate yet/);
  });
});
