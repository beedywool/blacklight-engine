import { Container as PixiContainer } from 'pixi.js';
import { describe, expect, it, vi } from 'vitest';
import { createGame, type Transition } from '../../src/game';
import { GameObject } from '../../src/objects/game-object';
import { Scene } from '../../src/scene';
import { CONFIG, Empty, frames, mount, scenes, startGame, until } from './helpers';

class Counter extends Scene {
  updates = 0;
  override update(): void {
    this.updates++;
  }
}

describe('createGame', () => {
  it('starts the entry scene in a WebGL canvas inside the mount', async () => {
    const element = mount(640, 360);
    const game = await startGame({ scenes: scenes({ main: Empty }), mount: element });
    expect(game.scene?.name).toBe('main');
    expect(element.querySelector('canvas')).toBe(game.app.canvas);
    expect(element.dataset.blacklightState).toBe('running');
    expect(element.dataset.blacklightScene).toBe('main');
    expect(document.title).toBe(CONFIG.name);
    // 320×180 design area in a 640×360 mount: scale 2, no letterbox.
    expect(game.viewport.scale).toBe(2);
    expect(game.textResolution).toBeGreaterThanOrEqual(2);
    await until(() => performance.getEntriesByName('blacklight:interactive').length > 0);
  });

  it('refuses an entry scene that does not exist and names the closest one', async () => {
    await expect(
      createGame({ ...CONFIG, entry: 'mian' }, { scenes: scenes({ main: Empty }), mount: mount() }),
    ).rejects.toThrow(/entry scene "mian".*Did you mean "main"\?.*scenes\/mian\/mian\.scene\.ts/);
  });

  it('runs plugins before the entry scene starts', async () => {
    const order: string[] = [];
    class Main extends Scene {
      override create(): void {
        order.push('create');
      }
    }
    await startGame({
      scenes: scenes({ main: Main }),
      plugins: [
        async (game) => {
          expect(game.scene).toBeUndefined();
          order.push('plugin');
        },
      ],
    });
    expect(order).toEqual(['plugin', 'create']);
  });
});

describe('game loop', () => {
  it('runs fixed steps from requestAnimationFrame and stops them while paused', async () => {
    const game = await startGame({ scenes: scenes({ main: Counter }) });
    const scene = game.scene as unknown as Counter;
    await until(() => scene.updates >= 3);
    const frameEvents: number[] = [];
    game.on('frame', ({ deltaMS }) => frameEvents.push(deltaMS));

    const pauses: string[] = [];
    game.on('pause', () => pauses.push('pause'));
    game.on('resume', () => pauses.push('resume'));
    game.pause();
    game.pause();
    const paused = scene.updates;
    await frames(5);
    expect(scene.updates).toBe(paused);
    // The display keeps running while paused (menus animate with `frame`).
    expect(frameEvents.length).toBeGreaterThanOrEqual(4);

    // Step-by-step debugging works whatever the pause state.
    const step = game.time.step;
    game.step(3);
    expect(scene.updates).toBe(paused + 3);
    expect(game.time.step).toBe(step + 3);
    expect(game.time.now).toBeCloseTo(((step + 3) * 1000) / 60);

    game.resume();
    game.resume();
    await until(() => scene.updates > paused + 3);
    expect(pauses).toEqual(['pause', 'resume']);
  });

  it('stops the logic and releases keys when the window loses focus', async () => {
    const game = await startGame(
      { scenes: scenes({ main: Counter }) },
      { input: { actions: { jump: ['Space'] } } },
    );
    const scene = game.scene as unknown as Counter;
    game.input.keyDown('Space');
    game.input.update();
    expect(game.input.held('jump' as never)).toBe(true);
    window.dispatchEvent(new Event('blur'));
    game.input.update();
    expect(game.input.held('jump' as never)).toBe(false);
    const before = scene.updates;
    await frames(4);
    expect(scene.updates).toBe(before);
    window.dispatchEvent(new Event('focus'));
    await until(() => scene.updates > before);
  });

  it('keeps running on blur when pauseOnBlur is off', async () => {
    const game = await startGame({ scenes: scenes({ main: Counter }) }, { pauseOnBlur: false });
    const scene = game.scene as unknown as Counter;
    window.dispatchEvent(new Event('blur'));
    const before = scene.updates;
    await until(() => scene.updates > before);
  });

  it('runs at the time scale: slow motion runs fewer steps', async () => {
    const game = await startGame({ scenes: scenes({ main: Counter }) });
    game.time.scale = 0;
    const scene = game.scene as unknown as Counter;
    const before = scene.updates;
    await frames(4);
    expect(scene.updates).toBe(before);
  });
});

describe('scenes', () => {
  it('goes to another scene, disposing the previous one and passing parameters', async () => {
    const created: unknown[] = [];
    class Level extends Scene<{ level: number }> {
      override create(params: { level: number }): void {
        created.push(params);
      }
    }
    const game = await startGame({ scenes: scenes({ main: Empty, level: Level }) });
    const first = game.scene!;
    const names: string[] = [];
    game.on('scene', ({ name }) => names.push(name));
    await game.goto('level' as never, { level: 2 });
    expect(game.scene).toBeInstanceOf(Level);
    expect(created).toEqual([{ level: 2 }]);
    expect(first.stage.destroyed).toBe(true);
    expect(names).toEqual(['level']);
    expect(game.mount.dataset.blacklightScene).toBe('level');
  });

  it('queues scene changes made while one is in progress', async () => {
    class A extends Scene {}
    class B extends Scene {}
    const game = await startGame({ scenes: scenes({ main: Empty, a: A, b: B }) });
    const names: string[] = [];
    game.on('scene', ({ name }) => names.push(name));
    const first = game.goto('a' as never);
    const second = game.goto('b' as never);
    await Promise.all([first, second]);
    expect(names).toEqual(['a', 'b']);
    expect(game.scene).toBeInstanceOf(B);
  });

  it('names known scenes when going to an unknown one', async () => {
    const game = await startGame({ scenes: scenes({ main: Empty, title: Empty }) });
    expect(game.sceneNames).toEqual(['main', 'title']);
    await expect(game.goto('titel' as never)).rejects.toThrow(
      /Unknown scene "titel". Did you mean "title"\?.*known scenes: main, title/,
    );
  });

  it('explains what a scene module must export', async () => {
    const game = await startGame({
      scenes: {
        main: () => Promise.resolve({ default: Empty }),
        broken: () => Promise.resolve({ default: class NotAScene {} as never }),
      },
    });
    await expect(game.goto('broken' as never)).rejects.toThrow(
      'scenes/broken/broken.scene.ts must default-export a class: `export default class ... extends Scene`.',
    );
  });

  it('plays a fade transition: covers, switches, then reveals', async () => {
    const game = await startGame({ scenes: scenes({ main: Empty, next: Empty }) });
    const progress: number[] = [];
    const record: Transition = {
      duration: 30,
      draw: (layer, value, size) => {
        expect(layer).toBeInstanceOf(PixiContainer);
        expect(size).toEqual({ width: 320, height: 180 });
        progress.push(value);
      },
    };
    game.transitions.set('record', record);
    await game.goto('next' as never, undefined, { transition: 'record' });
    expect(progress[0]).toBeCloseTo(0, 1);
    expect(Math.max(...progress)).toBe(1);
    expect(progress.at(-1)).toBe(0);
    // The built-in fade draws a black cover and clears it afterwards.
    await game.goto('main' as never, undefined, { transition: 'fade' });
    expect(game.scene?.name).toBe('main');
  });

  it('refuses an unknown transition and says how to register one', async () => {
    const game = await startGame({ scenes: scenes({ main: Empty, next: Empty }) });
    await expect(game.goto('next' as never, undefined, { transition: 'fdae' })).rejects.toThrow(
      /Unknown scene transition "fdae". Did you mean "fade"\?.*game\.transitions\.set/,
    );
  });

  it('opens overlays that pause the scenes below, and closes them', async () => {
    class Pause extends Counter {}
    const game = await startGame({ scenes: scenes({ main: Counter, pause: Pause }) });
    const main = game.scene as unknown as Counter;
    const overlay = (await game.overlay('pause' as never)) as unknown as Pause;
    const below = main.updates;
    game.step(2);
    expect(main.updates).toBe(below);
    expect(overlay.updates).toBe(2);

    const hud = (await game.overlay('pause' as never, undefined, {
      pauseBelow: false,
    })) as unknown as Pause;
    game.step(1);
    expect(overlay.updates).toBe(3);
    expect(hud.updates).toBe(1);
    expect(main.updates).toBe(below);

    game.closeOverlay(overlay);
    game.step(1);
    expect(main.updates).toBe(below + 1);
    game.closeOverlay();
    game.closeOverlay();
    expect(game.overlays).toHaveLength(0);
  });

  it('closes overlays when the scene changes', async () => {
    const game = await startGame({ scenes: scenes({ main: Empty, pause: Empty, other: Empty }) });
    const overlay = await game.overlay('pause' as never);
    await game.goto('other' as never);
    expect(game.overlays).toHaveLength(0);
    expect(overlay.stage.destroyed).toBe(true);
  });

  it('reports loading progress and preloads scenes ahead of time', async () => {
    class Hero extends GameObject {}
    const game = await startGame({
      scenes: scenes({ main: Empty, level: Empty }),
      objects: {
        global: {},
        scenes: {
          level: {
            Hero: {
              path: 'scenes/level/objects/hero',
              load: () => Promise.resolve({ default: Hero }),
            },
          },
        },
      },
    });
    const progress: number[] = [];
    game.on('loading', (event) => progress.push(event.progress));
    const drawn: number[] = [];
    game.loadingScreen = { draw: (_layer, value) => drawn.push(value) };
    await game.preload('level' as never);
    expect(progress).toEqual([]);
    await game.goto('level' as never);
    expect(progress.at(-1)).toBe(1);
    expect(drawn.at(-1)).toBe(1);
    expect(game.objectClass('Hero', 'level')).toBe(Hero);
  });
});

describe('objects registry', () => {
  it('loads global and scene objects, scene ones shadowing global ones', async () => {
    class Coin extends GameObject {}
    class LocalCoin extends GameObject {}
    const game = await startGame({
      scenes: scenes({ main: Empty }),
      objects: {
        global: { Coin: { path: 'objects/coin', load: () => Promise.resolve({ default: Coin }) } },
        scenes: {
          main: {
            Coin: {
              path: 'scenes/main/objects/coin',
              load: () => Promise.resolve({ default: LocalCoin }),
            },
          },
        },
      },
    });
    expect(game.objectClass('Coin')).toBe(Coin);
    expect(game.objectClass('Coin', 'main')).toBe(LocalCoin);
    expect(game.scene!.spawn('Coin' as never)).toBeInstanceOf(LocalCoin);
    expect(() => game.objectClass('Con')).toThrow(
      /Unknown object "Con". Did you mean "Coin"\?.*objects\/<name>\/<name>\.object\.ts/,
    );
  });

  it('explains what an object module must export', async () => {
    await expect(
      startGame({
        scenes: scenes({ main: Empty }),
        objects: {
          global: {
            Coin: {
              path: 'objects/coin',
              load: () => Promise.resolve({ default: 'nope' as never }),
            },
          },
          scenes: {},
        },
      }),
    ).rejects.toThrow(
      'objects/coin/coin.object.ts must default-export a class: `export default class ... extends Sprite`.',
    );
  });

  it('hot-replaces scenes and objects for later loads', async () => {
    class Coin extends GameObject {}
    class NewCoin extends GameObject {}
    class NewMain extends Scene {}
    const game = await startGame({
      scenes: scenes({ main: Empty }),
      objects: {
        global: { Coin: { path: 'objects/coin', load: () => Promise.resolve({ default: Coin }) } },
        scenes: {},
      },
    });
    expect(game.replaceObject('Coin', NewCoin)).toBe(Coin);
    expect(game.objectClass('Coin')).toBe(NewCoin);
    game.replaceScene('main', NewMain as unknown as typeof Scene);
    await game.goto('main' as never);
    expect(game.scene).toBeInstanceOf(NewMain);
  });
});

describe('screen', () => {
  it('converts pointer positions to design pixels and follows mount resizes', async () => {
    const element = mount(640, 360);
    const game = await startGame({ scenes: scenes({ main: Empty }), mount: element });
    const rect = game.app.canvas.getBoundingClientRect();
    expect(game.toVirtual(rect.left + 320, rect.top + 180)).toEqual({ x: 160, y: 90 });

    const resized = vi.fn();
    game.on('resize', resized);
    element.style.width = '320px';
    element.style.height = '180px';
    await until(() => resized.mock.calls.length > 0);
    expect(game.viewport.scale).toBe(1);
    expect(game.safeArea).toEqual({ x: 0, y: 0, width: 320, height: 180 });
  });
});
