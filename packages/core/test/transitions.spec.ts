import { describe, expect, it } from 'vitest';
import { resolveConfig } from '../src/config';
import { Game, type Transition } from '../src/game';

const config = resolveConfig({
  name: 'Test',
  id: 'com.example.test',
  version: '1.0.0',
  entry: 'a',
  resolution: { width: 640, height: 360 },
});

describe('named scene transitions', () => {
  it('registers fade and accepts custom names', () => {
    const game = new Game(config, { scenes: {}, mount: {} as HTMLElement });
    expect([...game.transitions.keys()]).toEqual(['fade']);
    const iris: Transition = { duration: 10, draw: () => {} };
    game.transitions.set('iris', iris);
    const resolve = (name: string) =>
      (
        game as unknown as { resolveTransition(n: string): Transition | undefined }
      ).resolveTransition(name);
    expect(resolve('iris')).toBe(iris);
    expect(resolve('none')).toBeUndefined();
    expect(() => resolve('irs')).toThrow(/Unknown scene transition "irs".*iris/s);
  });
});

describe('locales config', () => {
  it('accepts language codes and rejects other values', () => {
    const base = { name: 'T', id: 'com.example.t', version: '1.0.0', entry: 'a' };
    const resolution = { width: 10, height: 10 };
    expect(resolveConfig({ ...base, resolution, locales: { default: 'ja' } }).locales).toEqual({
      default: 'ja',
    });
    expect(() => resolveConfig({ ...base, resolution, locales: { default: 1 } })).toThrow(
      /`locales` must be an object/,
    );
  });
});
