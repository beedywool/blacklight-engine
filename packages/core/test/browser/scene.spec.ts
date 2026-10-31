import { RenderTexture, Sprite as PixiSprite } from 'pixi.js';
import { describe, expect, it } from 'vitest';
import { GameObject } from '../../src/objects/game-object';
import { Scene } from '../../src/scene';
import { Empty, scenes, startGame, wavUrl } from './helpers';

class Arena extends Scene {
  static override layers = ['back', 'main'];
  static override size = { width: 1000, height: 500 };
}

describe('Scene with a renderer', () => {
  it('splits the screen between cameras, each rendering the world into its own texture', async () => {
    const game = await startGame({ scenes: scenes({ main: Arena }) });
    const scene = game.scene!;
    scene.spawn(GameObject, { x: 10, y: 10 });
    const right = scene.addCamera({ x: 0.5, y: 0, width: 0.5, height: 1 });
    scene.camera.viewport = { x: 0, y: 0, width: 0.5, height: 1 };
    right.x = 800;
    game.step(1);
    // Drawing with two cameras moves the world out of the stage into render textures.
    const view = scene.stage.children[0]!;
    const sprites = () => view.children.filter((c) => c instanceof PixiSprite) as PixiSprite[];
    expect(sprites()).toHaveLength(2);
    expect(sprites()[1]!.texture).toBeInstanceOf(RenderTexture);
    expect(sprites()[1]!.x).toBe(160);
    expect(scene.world.parent).toBeNull();

    scene.addCamera({ x: 0, y: 0.5, width: 1, height: 0.5 });
    scene.addCamera({ x: 0, y: 0.5, width: 1, height: 0.5 });
    expect(() => scene.addCamera({ x: 0, y: 0, width: 1, height: 1 })).toThrow(
      'A scene has at most 4 cameras.',
    );
    game.step(1);
    expect(sprites()).toHaveLength(4);

    for (const camera of scene.cameras.slice(1)) scene.removeCamera(camera);
    scene.removeCamera(scene.camera); // the main camera stays
    game.step(1);
    expect(scene.cameras).toHaveLength(1);
    expect(sprites()).toHaveLength(0);
    expect(scene.world.parent).toBe(view);
  });

  it('hosts another scene in a masked rectangle of its HUD and steps it', async () => {
    class Mini extends Scene {
      steps2 = 0;
      override update(): void {
        this.steps2++;
      }
    }
    const game = await startGame({ scenes: scenes({ main: Empty, mini: Mini }) });
    const host = game.scene!;
    const mini = (await host.hostScene('mini' as never, {
      x: 20,
      y: 10,
      width: 100,
      height: 50,
    })) as unknown as Mini;
    expect(mini.host).toBe(host);
    expect([mini.width, mini.height]).toEqual([100, 50]);
    game.input.pointerMove(1, 'mouse', { x: 30, y: 20 });
    game.input.update();
    // Pointer positions are relative to the hosted rectangle.
    expect(mini.pointer.screen).toEqual({ x: 10, y: 10 });
    game.step(2);
    expect(mini.steps2).toBe(2);
    host.closeHosted(mini);
    host.closeHosted(mini);
    expect(host.hosted).toHaveLength(0);
    expect(mini.stage.destroyed).toBe(true);
  });

  it('closes hosted scenes with their host', async () => {
    const game = await startGame({ scenes: scenes({ main: Empty, mini: Empty, next: Empty }) });
    const mini = await game.scene!.hostScene('mini' as never, {
      x: 0,
      y: 0,
      width: 10,
      height: 10,
    });
    await game.goto('next' as never);
    expect(mini.stage.destroyed).toBe(true);
  });

  it('plays sounds from its own folder first', async () => {
    const game = await startGame({
      scenes: scenes({ main: Empty }),
      assets: {
        files: { 'assets/sfx/coin.wav': wavUrl(), 'scenes/main/assets/coin.wav': wavUrl() },
      },
    });
    const scene = game.scene!;
    // The scene's own assets/ folder is preloaded with it.
    expect(game.assets.isLoaded('scenes/main/assets/coin.wav')).toBe(true);
    expect(scene.audio).toBe(scene.audio);
    scene.audio.play('coin');
    scene.audio.music('coin');
    expect(game.audio.currentMusic).toBe('coin');
    scene.audio.stopMusic();
    expect(game.audio.history).toEqual(['coin', 'coin']);
  });

  it('explains how to add a UI layer and names its layers', async () => {
    const game = await startGame({ scenes: scenes({ main: Arena }) });
    const scene = game.scene!;
    expect(() => scene.ui).toThrow(
      'No UI layer: add @blacklight/ui to the game (`pnpm add @blacklight/ui vue`).',
    );
    expect(() => scene.layer('bakc')).toThrow(
      /Unknown layer "bakc". Did you mean "back"\?.*`static layers`/,
    );
    expect(scene.bounds).toEqual({ x: 0, y: 0, width: 1000, height: 500 });
    expect(scene.camera.bounds).toEqual({ x: 0, y: 0, width: 1000, height: 500 });
  });

  it('rounds the world to whole pixels in pixel-art games', async () => {
    const game = await startGame(
      { scenes: scenes({ main: Empty }) },
      { resolution: { width: 320, height: 180, pixelArt: true } },
    );
    const scene = game.scene!;
    scene.camera.x = 10.4;
    game.step(1);
    expect(scene.world.pivot.x).toBe(10);
  });
});
