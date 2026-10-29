import { describe, expect, it } from 'vitest';
import { EventBus } from '../src/events';
import { WebPlatform } from '../src/platform';
import type { CloudSaveProvider, SaveConfig, SavePayload } from '../src/save/index';
import { SaveError, SaveManager, decodeSave } from '../src/save/index';

function setup(release: boolean, save?: SaveConfig, platform = new WebPlatform('com.test.game')) {
  const events = new EventBus<{ step: { step: number }; scene: { name: string } }>();
  const host = {
    config: { id: 'com.test.game', save },
    platform,
    release,
    events,
    time: { dt: 1 / 60 },
    scene: { name: 'level' },
  };
  const manager = new SaveManager(host);
  const step = (n: number) => {
    for (let i = 0; i < n; i++) events.emit('step', { step: i });
  };
  return { manager, platform, events, step };
}

const text = (bytes: Uint8Array | undefined) => new TextDecoder().decode(bytes);

describe('saves (SV-01, SV-07)', () => {
  it('dev builds write readable JSON with metadata', async () => {
    const { manager, platform, step } = setup(false);
    manager.data = { gold: 120, party: ['ann'] };
    step(120);
    const meta = await manager.save(1, {
      label: 'Chapter 1',
      thumbnail: 'data:image/jpeg;base64,AA',
    });
    expect(meta.playTime).toBe(2000);
    expect(meta.scene).toBe('level');
    const file = JSON.parse(text(await platform.files.read('saves/1.sav'))) as SavePayload;
    expect(file.data).toEqual({ gold: 120, party: ['ann'] });
    expect(file.meta).toMatchObject({ label: 'Chapter 1', thumbnail: 'data:image/jpeg;base64,AA' });
    expect(Math.abs(file.meta.date - Date.now())).toBeLessThan(5000);
    expect(file.version).toBe(1);
  });

  it('loads, lists and deletes slots; the save is a copy of the data', async () => {
    const { manager } = setup(false, { slots: 3 });
    manager.data = { gold: 1 };
    await manager.save(2);
    manager.data.gold = 2;
    await manager.save('quick');
    manager.data.gold = 3;
    await manager.save('auto');
    expect(await manager.load(2)).toEqual({ gold: 1 });
    expect(manager.slot).toBe('2');
    const list = await manager.list();
    expect(list.map((s) => [s.slot, s.status])).toEqual([
      ['2', 'ok'],
      ['auto', 'ok'],
      ['quick', 'ok'],
    ]);
    await manager.delete('quick');
    expect((await manager.list()).map((s) => s.slot)).toEqual(['2', 'auto']);
    expect(() => manager.save(4)).toThrow(/1 to 3/);
    expect(() => manager.save('../escape')).toThrow(/Invalid save slot/);
    await expect(manager.load(1)).rejects.toMatchObject({ code: 'missing' });
  });

  it('migrates older formats and refuses newer ones', async () => {
    const platform = new WebPlatform('com.test.game');
    const old = setup(false, { version: 1 }, platform).manager;
    old.data = { coins: 5 };
    await old.save(1);

    const migrated = setup(
      false,
      {
        version: 3,
        migrations: {
          2: (data) => ({ gold: data.coins }),
          3: (data) => ({ ...data, gems: 0 }),
        },
      },
      platform,
    ).manager;
    expect(await migrated.load(1)).toEqual({ gold: 5, gems: 0 });

    const missing = setup(false, { version: 2 }, platform).manager;
    await expect(missing.load(1)).rejects.toThrow(/save\.migrations\[2\]/);

    await migrated.save(1);
    const older = setup(false, { version: 1 }, platform).manager;
    await expect(older.load(1)).rejects.toMatchObject({ code: 'version' });
    expect((await older.list())[0]?.status).toBe('version');
  });

  it('autosaves on scene change and every interval of play', async () => {
    const { manager, events, step, platform } = setup(false, {
      autosave: { interval: 1, onSceneChange: true },
    });
    events.emit('scene', { name: 'level' });
    await manager.list();
    expect(await platform.files.read('saves/auto.sav')).toBeUndefined(); // nothing to save yet
    manager.data = { gold: 1 };
    events.emit('scene', { name: 'level' });
    await manager.list();
    expect(JSON.parse(text(await platform.files.read('saves/auto.sav'))).data).toEqual({ gold: 1 });
    manager.data.gold = 2;
    step(60);
    await manager.list();
    expect(JSON.parse(text(await platform.files.read('saves/auto.sav'))).data).toEqual({ gold: 2 });
  });
});

describe('encrypted saves (SV-03, SV-04)', () => {
  it('release builds encrypt and sign: nothing readable in the file', async () => {
    const { manager, platform } = setup(true);
    manager.data = { gold: 987654, name: 'Ann' };
    await manager.save(1);
    const file = (await platform.files.read('saves/1.sav'))!;
    expect(text(file.subarray(0, 4))).toBe('BLSV');
    expect(text(file)).not.toContain('987654');
    expect(text(file)).not.toContain('Ann');
    manager.reset();
    expect(await manager.load(1)).toEqual({ gold: 987654, name: 'Ann' });
  });

  it('rejects a modified save and offers the backup', async () => {
    const { manager, platform } = setup(true);
    manager.data = { gold: 10 };
    await manager.save(1);
    manager.data = { gold: 20 };
    await manager.save(1); // the first version becomes the backup
    const file = (await platform.files.read('saves/1.sav'))!;
    for (const index of [5, 10, 30, file.length - 1]) {
      const copy = file.slice();
      copy[index] = copy[index]! ^ 1;
      await platform.files.write('saves/1.sav', copy);
      const error = await manager.load(1).catch((e: unknown) => e);
      expect(error).toBeInstanceOf(SaveError);
      expect(error).toMatchObject({ code: 'tampered', hasBackup: true, slot: '1' });
    }
    expect((await manager.list())[0]).toMatchObject({ status: 'tampered', hasBackup: true });
    expect((await manager.list())[0]?.meta?.date).toBeTypeOf('number');
    expect(await manager.load(1, { backup: true })).toEqual({ gold: 10 });
    // Saving over a tampered file keeps the good backup.
    await manager.save(1);
    expect(await manager.load(1, { backup: true })).toEqual({ gold: 10 });
  });

  it('refuses plain files, foreign keys and garbage in release builds', async () => {
    const dev = setup(false);
    dev.manager.data = { gold: 999999 };
    await dev.manager.save(1);
    const release = setup(true, undefined, dev.platform).manager;
    await expect(release.load(1)).rejects.toMatchObject({ code: 'tampered' });

    // Another install (another key) cannot read it either.
    const other = setup(true);
    other.manager.data = { gold: 1 };
    await other.manager.save(1);
    await dev.platform.files.write(
      'saves/2.sav',
      (await other.platform.files.read('saves/1.sav'))!,
    );
    await expect(release.load(2)).rejects.toMatchObject({ code: 'tampered' });

    await dev.platform.files.write('saves/3.sav', new TextEncoder().encode('{not json'));
    await expect(dev.manager.load(3)).rejects.toMatchObject({ code: 'corrupted' });
  });

  it('integrity without encryption keeps the JSON readable but signed', async () => {
    const { manager, platform } = setup(true, { encryption: false, integrity: true });
    manager.data = { gold: 5 };
    await manager.save(1);
    const file = (await platform.files.read('saves/1.sav'))!;
    expect(text(file)).toContain('"gold":5');
    const edited = new TextEncoder().encode(text(file).replace('"gold":5', '"gold":9'));
    await platform.files.write('saves/1.sav', edited);
    await expect(manager.load(1)).rejects.toMatchObject({ code: 'tampered' });
    await expect(
      decodeSave(file, { encryption: false, integrity: true, key: () => platform.saveKey() }),
    ).resolves.toMatchObject({ data: { gold: 5 } });
  });
});

describe('export and import (SV-05)', () => {
  it('moves saves between installs with a password', async () => {
    const a = setup(true);
    a.manager.data = { gold: 42 };
    await a.manager.save(1);
    await a.manager.save('quick');
    const file = await a.manager.export('correct horse');
    expect(text(file)).not.toContain('42');

    const b = setup(true);
    await expect(b.manager.import(file, 'wrong')).rejects.toMatchObject({ code: 'password' });
    expect((await b.manager.import(file, 'correct horse')).sort()).toEqual(['1', 'quick']);
    expect(await b.manager.load('quick')).toEqual({ gold: 42 });
    await expect(a.manager.export('')).rejects.toMatchObject({ code: 'password' });

    const other = new SaveManager({
      config: { id: 'com.other.game' },
      platform: new WebPlatform('com.other.game'),
      events: new EventBus<{ step: void; scene: { name: string } }>(),
      time: { dt: 1 / 60 },
    });
    await expect(other.import(file, 'correct horse')).rejects.toThrow(/another game/);
  });
});

describe('cloud saves hook (SV-06)', () => {
  function memoryCloud(): CloudSaveProvider & {
    files: Map<string, SavePayload>;
    offline: boolean;
  } {
    const files = new Map<string, SavePayload>();
    const cloud = {
      name: 'memory',
      files,
      offline: false,
      list: async () => {
        if (cloud.offline) throw new Error('offline');
        return [...files].map(([slot, p]) => ({ slot, date: p.meta.date }));
      },
      download: async (slot: string) => files.get(slot),
      upload: async (slot: string, payload: SavePayload) => {
        if (cloud.offline) throw new Error('offline');
        files.set(slot, payload);
      },
      remove: async (slot: string) => void files.delete(slot),
    };
    return cloud;
  }

  it('uploads saves, downloads new remote slots and resolves conflicts', async () => {
    const cloud = memoryCloud();
    const a = setup(true).manager;
    a.useCloud(cloud);
    a.data = { gold: 1 };
    await a.save(1);
    await a.sync();
    expect(cloud.files.get('1')?.data).toEqual({ gold: 1 });

    const b = setup(true).manager;
    b.useCloud(cloud);
    expect(await b.sync()).toMatchObject({ downloaded: ['1'] });
    expect(await b.load(1)).toEqual({ gold: 1 });

    // Both sides change: the newest wins by default…
    await new Promise((r) => setTimeout(r, 5));
    a.data = { gold: 2 };
    await a.save(1);
    await new Promise((r) => setTimeout(r, 5));
    b.data = { gold: 3 };
    cloud.offline = true;
    await b.save(1);
    expect((await b.sync()).error?.message).toBe('offline');
    cloud.offline = false;
    expect(await b.sync()).toMatchObject({ conflicts: [{ slot: '1', kept: 'local' }] });
    expect(cloud.files.get('1')?.data).toEqual({ gold: 3 });

    // …or the player chooses.
    await new Promise((r) => setTimeout(r, 5));
    a.data = { gold: 4 };
    cloud.offline = true;
    await a.save(1);
    cloud.offline = false;
    a.useCloud(cloud, { conflict: ({ remote }) => (remote.date > 0 ? 'remote' : 'local') });
    expect(await a.sync()).toMatchObject({ conflicts: [{ slot: '1', kept: 'remote' }] });
    expect(await a.load(1)).toEqual({ gold: 3 });
  });
});

describe('ModuleSaves for modules (cloud-save)', () => {
  it('exports portable bytes, imports them on another install and reports saves', async () => {
    const a = setup(true).manager;
    const seen: string[] = [];
    const off = a.onSaved((slot) => seen.push(slot));
    a.data = { gold: 7 };
    await a.save(2);
    off();
    expect(seen).toEqual(['2']);
    expect((await a.slots()).map((s) => s.slot)).toEqual(['2']);
    const bytes = (await a.exportSlot('2'))!;
    expect(await a.exportSlot('3')).toBeUndefined();

    const b = setup(true).manager;
    await b.importSlot('2', bytes);
    expect(await b.load(2)).toEqual({ gold: 7 });
    await expect(b.importSlot('1', new TextEncoder().encode('nope'))).rejects.toMatchObject({
      code: 'corrupted',
    });
  });
});
