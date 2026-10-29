import { describe, expect, it } from 'vitest';
import { CapacitorFiles, fromBase64, isNotFound, toBase64 } from '../src/files';
import { fakeDevice } from './fakes';

const bytes = (...values: number[]) => new Uint8Array(values);

describe('base64', () => {
  it('round-trips every byte value and large buffers', () => {
    const all = Uint8Array.from({ length: 256 }, (_, i) => i);
    expect(fromBase64(toBase64(all))).toEqual(all);
    const large = Uint8Array.from({ length: 200_000 }, (_, i) => (i * 31) & 255);
    expect(fromBase64(toBase64(large))).toEqual(large);
  });
});

describe('CapacitorFiles', () => {
  it('writes through a temporary file renamed over the target', async () => {
    const device = fakeDevice();
    const files = new CapacitorFiles(device.plugins);
    await files.write('saves/slot-1.sav', bytes(1, 2, 3));
    expect(device.calls).toEqual([
      ['filesystem.writeFile', 'blacklight/saves/slot-1.sav.tmp'],
      [
        'filesystem.rename',
        { from: 'blacklight/saves/slot-1.sav.tmp', to: 'blacklight/saves/slot-1.sav' },
      ],
    ]);
    expect(await files.read('saves/slot-1.sav')).toEqual(bytes(1, 2, 3));
    expect(await files.read('saves/missing.sav')).toBeUndefined();
  });

  it('replaces an existing file on iOS, where rename refuses to overwrite', async () => {
    const device = fakeDevice('ios');
    const files = new CapacitorFiles(device.plugins);
    await files.write('settings.json', bytes(1));
    await files.write('settings.json', bytes(2));
    expect(await files.read('settings.json')).toEqual(bytes(2));
    expect([...device.files.keys()]).toEqual(['blacklight/settings.json']);
  });

  it('recovers a write interrupted before the rename', async () => {
    const device = fakeDevice();
    device.files.set('blacklight/slot.sav.tmp', toBase64(bytes(9, 9)));
    const files = new CapacitorFiles(device.plugins);
    expect(await files.list()).toEqual(['slot.sav']);
    expect(await files.read('slot.sav')).toEqual(bytes(9, 9));
    expect([...device.files.keys()]).toEqual(['blacklight/slot.sav']);
  });

  it('lists nested files by prefix and removes them', async () => {
    const files = new CapacitorFiles(fakeDevice().plugins);
    await files.write('saves/a.sav', bytes(1));
    await files.write('saves/deep/b.sav', bytes(2));
    await files.write('config.json', bytes(3));
    expect(await files.list()).toEqual(['config.json', 'saves/a.sav', 'saves/deep/b.sav']);
    expect(await files.list('saves/')).toEqual(['saves/a.sav', 'saves/deep/b.sav']);
    await files.remove('saves/a.sav');
    await files.remove('saves/never-written.sav');
    expect(await files.list('saves/')).toEqual(['saves/deep/b.sav']);
    expect(await new CapacitorFiles(fakeDevice().plugins).list()).toEqual([]);
  });

  it('rejects paths that leave the folder or collide with temporary files', async () => {
    const files = new CapacitorFiles(fakeDevice().plugins);
    for (const path of ['', '/etc/passwd', '../x', 'a/../../x', 'a/./b']) {
      await expect(files.write(path, bytes(1))).rejects.toThrow(/relative path/);
    }
    await expect(files.write('x.tmp', bytes(1))).rejects.toThrow(/reserved/);
  });

  it('knows its native folder after init', async () => {
    const files = new CapacitorFiles(fakeDevice().plugins);
    expect(files.location).toBeUndefined();
    await files.init();
    expect(files.location).toBe('file:///data/user/0/com.example.test/files/blacklight');
  });

  it('recognises not-found errors from both platforms', () => {
    expect(isNotFound({ code: 'OS-PLUG-FILE-0008' })).toBe(true);
    expect(isNotFound(new Error("The file doesn't exist."))).toBe(true);
    expect(isNotFound(new Error('Permission denied'))).toBe(false);
  });
});
