import { Container } from 'pixi.js';
import { describe, expect, it } from 'vitest';
import { installDebugChannel, type DebugMessage } from '../src/debug/channel';
import { hotReplaceObject, hotReplaceScene, patchClass } from '../src/debug/hot';
import { EventBus } from '../src/events';
import type { Game } from '../src/game';
import { InputManager } from '../src/input/input';
import { GameObject } from '../src/objects/game-object';
import { Random } from '../src/random';
import { stamp } from '../src/registry';
import { Scene } from '../src/scene';

/** A minimal game that can switch, replace and restore scenes, without a renderer. */
function testGame(classes: Record<string, typeof GameObject>) {
  const registry = new Map(Object.entries(classes));
  for (const [name, type] of registry) stamp(type, name, `objects/${name.toLowerCase()}`);
  const sceneClasses: Record<string, typeof Scene> = {};
  const game = {
    config: {
      name: 'Test',
      resolution: { width: 640, height: 360, mode: 'extend', pixelArt: false },
      tickRate: 60,
    },
    random: new Random('test'),
    input: new InputManager({}, undefined, () => []),
    audio: { updateListener: () => {} },
    sheets: { get: () => undefined, preload: async () => {} },
    textResolution: 1,
    time: { dt: 1 / 60, step: 0 },
    world: new Container(),
    overlays: [] as never[],
    events: new EventBus<{ scene: { name: string } }>(),
    scene: undefined as Scene<never> | undefined,
    paused: false,
    pause() {
      this.paused = true;
    },
    resume() {
      this.paused = false;
    },
    step(count: number) {
      for (let i = 0; i < count; i++) this.scene!.step(1 / 60);
      this.time.step += count;
    },
    rememberClass: (type: typeof GameObject) => {
      if (!registry.has(type.objectName ?? type.name))
        registry.set(type.objectName ?? type.name, type);
    },
    objectClass: (name: string) => registry.get(name),
    replaceScene: (name: string, type: typeof Scene) => (sceneClasses[name] = type),
    replaceObject: (name: string, type: typeof GameObject) => {
      const previous = registry.get(name);
      registry.set(name, type);
      return previous;
    },
    async start(name: string, Type: new () => Scene<never>, params?: unknown) {
      const scene = new Type();
      scene.init(this as unknown as Game, name);
      this.world.addChild(scene.stage);
      await scene.start(params);
      this.scene = scene;
      return scene;
    },
  };
  return { game, registry, sceneClasses };
}

class Coin extends GameObject {
  value = 1;
}

describe('scene.load', () => {
  it('spawns layout objects with their props, tags and layers', async () => {
    const { game } = testGame({ Coin });
    class Level extends Scene {
      static override layers = ['back', 'main'];
    }
    const scene = await game.start('level', Level);
    const objects = scene.load({
      objects: [
        { type: 'Coin', x: 10, y: 20 },
        {
          type: 'Coin',
          x: 30,
          y: 40,
          layer: 'back',
          angle: 90,
          scale: 2,
          tags: ['bonus'],
          props: { value: 5 },
        },
      ],
    });
    expect(objects.map((o) => [o.x, o.y, (o as Coin).value])).toEqual([
      [10, 20, 1],
      [30, 40, 5],
    ]);
    expect(scene.find('bonus')).toBe(objects[1]);
    expect(objects[1]!.parent).toBe(scene.layer('back'));
    expect(objects[1]!.angle).toBe(90);
    expect(objects[1]!.scale.x).toBe(2);
    expect(() => scene.load({} as never)).toThrow(/\.layout\.json/);
    expect(() => scene.load({ objects: [{ type: 'Coin' } as never] })).toThrow(/needs "type"/);
  });
});

describe('patchClass', () => {
  it('gives live instances and subclasses the new methods', () => {
    class A {
      hp = 3;
      speak() {
        return 'old';
      }
      gone() {
        return 1;
      }
      static label = 'A1';
    }
    class B extends A {}
    class A2 {
      hp = 9;
      speak() {
        return `new ${this.hp}`;
      }
      static label = 'A2';
    }
    const a = new A();
    const b = new B();
    patchClass(A, A2);
    expect(a.speak()).toBe('new 3');
    expect(b.speak()).toBe('new 3');
    expect('gone' in a).toBe(false);
    expect(A.label).toBe('A2');
    expect(a instanceof A).toBe(true);
  });
});

describe('hot reload', () => {
  it('patches live objects, keeps their state and adds new fields', async () => {
    const { game, registry } = testGame({ Coin });
    class Level extends Scene {}
    const scene = await game.start('level', Level);
    const coin = scene.spawn('Coin', { x: 50, y: 60 }) as Coin;
    coin.value = 7;
    class Coin2 extends GameObject {
      value = 1;
      bonus = 3;
      worth() {
        return this.value * this.bonus;
      }
    }
    const result = await hotReplaceObject(
      game as unknown as Game,
      { name: 'Coin', path: 'objects/coin' },
      Coin2,
    );
    expect(result).toBe('patched');
    expect(coin.x).toBe(50);
    expect((coin as unknown as Coin2).worth()).toBe(21);
    expect(registry.get('Coin')).toBe(Coin2);
    expect(scene.spawn('Coin', {})).toBeInstanceOf(Coin2);
  });

  it('rebuilds the running scene from the new class and restores its state', async () => {
    const { game, sceneClasses } = testGame({ Coin });
    class Level extends Scene<{ start: number }> {
      coin!: Coin;
      score = 0;
      override create({ start }: { start: number }) {
        this.coin = this.spawn(Coin, { x: start, y: 0, velocity: { x: 60, y: 0 } });
      }
      override update() {
        this.score++;
      }
    }
    const old = await game.start('level', Level as never, { start: 10 });
    game.step(30);
    expect((old as unknown as Level).coin.x).toBeCloseTo(40);
    class Level2 extends Level {
      override update() {
        this.score += 100;
      }
    }
    expect(await hotReplaceScene(game as unknown as Game, 'level', Level2 as never)).toBe(
      'replaced',
    );
    expect(sceneClasses.level).toBe(Level2);
    const scene = game.scene as unknown as Level2;
    expect(scene).toBeInstanceOf(Level2);
    expect(scene.score).toBe(30);
    expect(scene.coin.x).toBeCloseTo(40);
    expect(scene.objects).toHaveLength(1);
    expect(game.world.children).toEqual([scene.stage]);
    game.step(1);
    expect(scene.score).toBe(130);
    expect(scene.coin.x).toBeCloseTo(41);
  });

  it('keeps the running scene when the new create() throws', async () => {
    const { game } = testGame({});
    class Level extends Scene {
      value() {
        return 1;
      }
    }
    const old = await game.start('level', Level);
    class Broken extends Scene {
      override create() {
        throw new Error('typo');
      }
      value() {
        return 2;
      }
    }
    const errors = console.error;
    console.error = () => {};
    const result = await hotReplaceScene(game as unknown as Game, 'level', Broken);
    console.error = errors;
    expect(result).toBe('patched');
    expect(game.scene).toBe(old);
    expect((old as Level).value()).toBe(2);
  });
});

describe('debug channel', () => {
  it('lists objects, inspects and edits them, steps the game', async () => {
    const { game } = testGame({ Coin });
    class Level extends Scene {}
    const scene = await game.start('level', Level);
    const coin = scene.spawn(Coin, { x: 5, y: 6 });
    const sent: DebugMessage[] = [];
    let listener: (data: unknown) => void = () => {};
    const channel = installDebugChannel(
      game as unknown as Game,
      { on: (_, l) => (listener = l), send: (_, data) => sent.push(data as DebugMessage) },
      { client: 'test' },
    );
    expect(sent[0]).toMatchObject({
      kind: 'event',
      type: 'hello',
      data: { client: 'test', scene: 'level' },
    });
    const call = async (method: string, params?: Record<string, unknown>, target?: string) => {
      const id = String(sent.length);
      listener({ kind: 'request', id, method, params, target });
      await new Promise((resolve) => setTimeout(resolve, 0));
      return sent.find((m) => m.kind === 'response' && m.id === id);
    };
    expect(await call('objects')).toMatchObject({
      result: {
        scene: 'level',
        objects: [{ id: coin.id, type: 'Coin', x: 5, y: 6, scene: 'level' }],
      },
    });
    expect(await call('inspect', { id: coin.id })).toMatchObject({
      result: { data: { value: 1 } },
    });
    expect(await call('set', { id: coin.id, path: 'value', value: 9 })).toMatchObject({
      result: { data: { value: 9 } },
    });
    await call('set', { id: coin.id, path: 'core.x', value: 100 });
    expect(coin.x).toBe(100);
    expect(await call('step', { count: 3 })).toMatchObject({ result: { step: 3 } });
    expect(await call('nope')).toMatchObject({
      error: expect.stringMatching(/Unknown debug method/),
    });
    expect(await call('objects', {}, 'someone-else')).toBeUndefined();
    channel.methods.custom = () => 42;
    expect(await call('custom')).toMatchObject({ result: 42 });
    channel.dispose();
  });
});
