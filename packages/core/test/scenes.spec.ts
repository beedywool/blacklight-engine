import { describe, expect, it } from 'vitest';
import { scenesFromGlob } from '../src/scenes';
import { didYouMean, suggest } from '../src/suggest';

const load = () => Promise.resolve({});

describe('scenesFromGlob', () => {
  it('names scenes after their folder', () => {
    const scenes = scenesFromGlob({
      '../scenes/title/title.scene.ts': load,
      '/scenes/battle/battle.scene.js': load,
      '../scenes/title/helper.ts': load,
    });
    expect(Object.keys(scenes).sort()).toEqual(['battle', 'title']);
  });

  it('rejects a file named differently from its folder', () => {
    expect(() => scenesFromGlob({ '../scenes/title/menu.scene.ts': load })).toThrow(
      /scenes\/title\/title\.scene\.ts/,
    );
  });
});

describe('suggest', () => {
  it('finds close names', () => {
    expect(suggest('titel', ['title', 'battle', 'results'])).toEqual(['title']);
    expect(didYouMean('batle', ['title', 'battle'])).toBe(' Did you mean "battle"?');
    expect(didYouMean('zzz', ['title'])).toBe('');
  });
});
