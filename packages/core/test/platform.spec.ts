import { describe, expect, it } from 'vitest';
import { WebPlatform } from '../src/platform';

describe('WebPlatform', () => {
  it('stores files and keeps one save key (in memory without IndexedDB)', async () => {
    const platform = new WebPlatform('test');
    await platform.files.write('saves/1.sav', new Uint8Array([1, 2, 3]));
    expect(await platform.files.read('saves/1.sav')).toEqual(new Uint8Array([1, 2, 3]));
    expect(await platform.files.list('saves/')).toEqual(['saves/1.sav']);
    await platform.files.remove('saves/1.sav');
    expect(await platform.files.read('saves/1.sav')).toBeUndefined();
    const key = await platform.saveKey();
    expect(key.extractable).toBe(false);
    expect(await platform.saveKey()).toBe(key);
  });

  it('answers native calls with web fallbacks only', async () => {
    const platform = new WebPlatform('test');
    await expect(platform.invoke('steam', 'unlock', 'a')).rejects.toThrow(/desktop or mobile/);
    platform.registerFallback('echo', { say: (word) => `${word}!` });
    await expect(platform.invoke('echo', 'say', 'hi')).resolves.toBe('hi!');
  });
});
