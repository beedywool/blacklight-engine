import { describe, expect, it, vi } from 'vitest';
import { assetKey, resolveProjectPath, AssetStore } from '../src/assets';
import { Disposables, EventBus } from '../src/events';
import { Vector2, angleDelta, approach } from '../src/math';
import { Random } from '../src/random';
import { objectsFromGlob, pascalCase } from '../src/registry';
import { Timers } from '../src/timers';
import { Tweens } from '../src/tween';

describe('EventBus', () => {
  it('emits, removes and counts listeners', () => {
    const bus = new EventBus<{ hit: number; done: void }>();
    const seen: number[] = [];
    const off = bus.on('hit', (n) => seen.push(n));
    bus.once('hit', (n) => seen.push(n * 10));
    bus.emit('hit', 1);
    bus.emit('hit', 2);
    off();
    bus.emit('hit', 3);
    expect(seen).toEqual([1, 10, 2]);
    expect(bus.count()).toBe(0);
  });

  it('disposes groups of listeners', () => {
    const bus = new EventBus<{ x: void }>();
    const group = new Disposables();
    const fn = vi.fn();
    group.add(bus.on('x', fn));
    group.dispose();
    bus.emit('x');
    expect(fn).not.toHaveBeenCalled();
  });
});

describe('Random', () => {
  it('is deterministic and restorable', () => {
    const a = new Random('seed');
    const b = new Random('seed');
    const seq = Array.from({ length: 5 }, () => a.next());
    expect(Array.from({ length: 5 }, () => b.next())).toEqual(seq);
    const state = a.state;
    const next = a.int(1, 6);
    a.state = state;
    expect(a.int(1, 6)).toBe(next);
  });

  it('keeps ranges', () => {
    const r = new Random(1);
    for (let i = 0; i < 1000; i++) {
      const n = r.int(1, 6);
      expect(n).toBeGreaterThanOrEqual(1);
      expect(n).toBeLessThanOrEqual(6);
    }
    expect(r.shuffle([1, 2, 3, 4]).sort()).toEqual([1, 2, 3, 4]);
    expect(() => r.pick([])).toThrow();
  });
});

describe('Timers', () => {
  it('fires in order, repeats and cancels', () => {
    const timers = new Timers();
    const log: string[] = [];
    timers.after(50, () => log.push('a'));
    const stop = timers.every(20, () => log.push('e'));
    timers.advance(45);
    timers.advance(10);
    stop();
    timers.advance(100);
    expect(log).toEqual(['e', 'e', 'a']);
  });

  it('captures and restores', () => {
    const timers = new Timers();
    const fn = vi.fn();
    timers.after(100, fn);
    const state = timers.capture();
    timers.advance(100);
    timers.restore(state);
    timers.advance(100);
    expect(fn).toHaveBeenCalledTimes(2);
  });
});

describe('Tweens', () => {
  it('animates nested numbers on the game clock', async () => {
    const target = { x: 0, scale: { x: 1 } };
    const tweens = new Tweens();
    const tween = tweens.add(target, { x: 100, 'scale.x': 2 }, { duration: 100, ease: 'linear' });
    tweens.step(50);
    expect(target.x).toBeCloseTo(50);
    tweens.step(50);
    expect(target).toEqual({ x: 100, scale: { x: 2 } });
    await expect(tween.finished).resolves.toBeUndefined();
    expect(tweens.size).toBe(0);
  });

  it('handles delay, yoyo repeats and springs', () => {
    const target = { a: 0, b: 0 };
    const tweens = new Tweens();
    tweens.add(
      target,
      { a: 10 },
      { duration: 100, delay: 50, ease: 'linear', repeat: 1, yoyo: true },
    );
    tweens.step(50);
    expect(target.a).toBe(0);
    tweens.step(100);
    expect(target.a).toBe(10);
    tweens.step(100);
    expect(target.a).toBeCloseTo(0);
    tweens.add(target, { b: 1 }, { ease: { type: 'spring', stiffness: 200, damping: 20 } });
    for (let i = 0; i < 400; i++) tweens.step(16);
    expect(target.b).toBeCloseTo(1);
  });

  it('refuses non-numbers', () => {
    const tweens = new Tweens();
    tweens.add({ a: 'x' }, { a: 1 });
    expect(() => tweens.step(10)).toThrow(/not a number/);
  });
});

describe('math', () => {
  it('works', () => {
    expect(new Vector2(3, 4).length).toBe(5);
    expect(new Vector2(10, 0).limit(2).x).toBe(2);
    expect(approach(0, 10, 3)).toBe(3);
    expect(angleDelta(0.1, Math.PI * 2 - 0.1)).toBeCloseTo(-0.2);
  });
});

describe('assets', () => {
  const store = new AssetStore({
    files: {
      'assets/sfx/coin.ogg': '/a.ogg',
      'assets/sfx/coin.m4a': '/a.m4a',
      'scenes/level/assets/coin.wav': '/l.wav',
      'objects/hero/hero.png': '/h.png',
      'assets/music/theme.ogg': '/t.ogg',
    },
  });

  it('resolves paths and keys', () => {
    expect(resolveProjectPath('@assets/sfx/coin.ogg')).toBe('assets/sfx/coin.ogg');
    expect(resolveProjectPath('./hero.png', 'objects/hero')).toBe('objects/hero/hero.png');
    expect(resolveProjectPath('../shared/x.png', 'objects/hero')).toBe('objects/shared/x.png');
    expect(assetKey('assets/a/coin.sheet.png')).toBe('coin');
  });

  it('finds by key, preferring the scene, and by path without extension', () => {
    expect(store.find('coin', { preferDirs: ['scenes/level'] })).toEqual([
      'scenes/level/assets/coin.wav',
    ]);
    expect(store.find('coin').sort()).toEqual(['assets/sfx/coin.m4a', 'assets/sfx/coin.ogg']);
    expect(store.find('@assets/sfx/coin')).toHaveLength(2);
    expect(() => store.find('them')).toThrow(/Did you mean "theme"/);
  });

  it('explains unloaded files', () => {
    expect(() => store.texture('objects/hero/hero.png')).toThrow(/static assets/);
  });

  it('loads extra file types through registered loaders', async () => {
    const models = new AssetStore({ files: { 'models/hero.glb': '/hero.glb' } });
    const loader = vi.fn((path: string, url: string) => Promise.resolve({ path, url }));
    AssetStore.registerLoader(['GLB'], loader);
    expect(() => models.get('models/hero.glb')).toThrow(/static assets/);
    await models.load(['models/hero.glb', 'models/hero.glb']);
    expect(loader).toHaveBeenCalledTimes(1);
    expect(loader.mock.calls[0]![2]).toBe(models);
    expect(models.get('models/hero.glb')).toEqual({ path: 'models/hero.glb', url: '/hero.glb' });
  });
});

describe('registry', () => {
  it('names objects after their folder', () => {
    const load = () => Promise.resolve({});
    const registry = objectsFromGlob({
      '../objects/big-enemy/big-enemy.object.ts': load,
      '../scenes/battle/objects/shadow/shadow.object.ts': load,
    });
    expect(Object.keys(registry.global)).toEqual(['BigEnemy']);
    expect(registry.scenes.battle!.Shadow!.path).toBe('scenes/battle/objects/shadow');
    expect(() => objectsFromGlob({ '../objects/a/b.object.ts': load })).toThrow(
      /objects\/a\/a\.object\.ts/,
    );
    expect(pascalCase('my_cool-thing')).toBe('MyCoolThing');
  });
});
