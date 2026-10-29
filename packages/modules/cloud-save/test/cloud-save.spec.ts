import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { EventBus, ModuleHost, type Game, type ModuleSaves, type Platform } from '@blacklight/core';
import { http } from '@blacklight/module-http';
import { accountsOidc, type Accounts } from '../../accounts-oidc/src/index';
import { startMockProvider, type MockProvider } from '../../accounts-oidc/src/testing';
import { desktop } from '../../accounts-oidc/test/platform';
import { spawnReferenceServer, type SpawnedServer } from '../../../../servers/reference/test/spawn';
import { cloudSave, type CloudSave } from '../src/index';

const GAME_ID = 'com.example.test';
const text = (data: Uint8Array | undefined) => (data ? new TextDecoder().decode(data) : undefined);
const bytes = (value: string) => new TextEncoder().encode(value);

/** The save system as modules see it, in memory. */
class FakeSaves implements ModuleSaves {
  readonly slotsData = new Map<string, { data: Uint8Array; updatedAt: number }>();
  private readonly events = new EventBus<{ saved: string }>();
  private clock = Date.now();

  /** The game saves a slot (a later time than the previous write). */
  async save(slot: string, value: string, at = (this.clock += 1000)): Promise<void> {
    this.slotsData.set(slot, { data: bytes(value), updatedAt: at });
    this.events.emit('saved', slot);
  }
  read(slot: string): string | undefined {
    return text(this.slotsData.get(slot)?.data);
  }
  async slots() {
    return [...this.slotsData].map(([slot, s]) => ({ slot, updatedAt: s.updatedAt }));
  }
  async exportSlot(slot: string) {
    return this.slotsData.get(slot)?.data;
  }
  async importSlot(slot: string, data: Uint8Array) {
    this.slotsData.set(slot, { data, updatedAt: (this.clock += 1000) });
  }
  onSaved(listener: (slot: string) => void) {
    return this.events.on('saved', listener);
  }
}

let hosts: ModuleHost[] = [];
afterEach(async () => {
  for (const host of hosts) await host.dispose();
  hosts = [];
});

async function device(
  platform: Platform,
  saves: FakeSaves,
  modules: Record<string, object>,
): Promise<{ cloud: CloudSave; accounts?: Accounts }> {
  const game = { config: { id: GAME_ID, modules }, platform, save: saves } as unknown as Game;
  const host = new ModuleHost(game);
  hosts.push(host);
  const definitions = [http, cloudSave, ...('accounts-oidc' in modules ? [accountsOidc] : [])];
  await host.install({ definitions });
  return {
    cloud: host.apis['cloud-save'] as CloudSave,
    accounts: host.apis['accounts-oidc'] as Accounts | undefined,
  };
}

function next<E extends 'uploaded' | 'downloaded'>(cloud: CloudSave, event: E): Promise<void> {
  return new Promise((resolve) => {
    const off = cloud.on(event, () => {
      off();
      resolve();
    });
  });
}

describe('cloud saves on the reference server', () => {
  let provider: MockProvider;
  let server: SpawnedServer;
  beforeAll(async () => {
    provider = await startMockProvider();
    server = await spawnReferenceServer({ [GAME_ID]: {} }, [
      { issuer: provider.issuer, audiences: ['test-game'] },
    ]);
  });
  afterAll(async () => {
    await server.stop();
    await provider.close();
  });

  const modules = (conflict = 'newest') => ({
    http: {},
    'accounts-oidc': { issuer: provider.issuer, clientId: 'test-game', server: server.url },
    'cloud-save': { conflict },
  });

  it('uploads saves made while signed out, then syncs them to another device', async () => {
    const savesA = new FakeSaves();
    const a = await device(desktop(GAME_ID), savesA, modules());
    await savesA.save('slot1', 'level 3');
    await a.cloud.upload('slot1');
    expect(a.cloud.pending).toBe(1); // 401: no session yet, kept

    const uploaded = next(a.cloud, 'uploaded');
    await a.accounts!.login();
    await a.cloud.upload('slot1');
    await uploaded;
    expect(a.cloud.pending).toBe(0);

    const savesB = new FakeSaves();
    const b = await device(desktop(GAME_ID), savesB, modules());
    await b.accounts!.login();
    await b.cloud.sync();
    expect(savesB.read('slot1')).toBe('level 3');

    // A later save on B uploads by itself and reaches A on its next sync.
    const sent = next(b.cloud, 'uploaded');
    await savesB.save('slot1', 'level 4');
    await sent;
    await a.cloud.sync();
    expect(savesA.read('slot1')).toBe('level 4');
  });

  it('resolves slots changed on both devices: newest by default, the player with "ask"', async () => {
    const savesA = new FakeSaves();
    const savesB = new FakeSaves();
    const a = await device(desktop(GAME_ID), savesA, {
      ...modules(),
      'cloud-save': { conflict: 'ask', autoUpload: false },
    });
    const b = await device(desktop(GAME_ID), savesB, {
      ...modules(),
      'cloud-save': { autoUpload: false },
    });
    await a.accounts!.login();
    await b.accounts!.login();
    await savesA.save('duel', 'base');
    await a.cloud.sync();
    await b.cloud.sync();
    expect(savesB.read('duel')).toBe('base');

    // Both play offline, B saves later.
    await savesA.save('duel', 'from A', Date.now() + 10_000);
    await savesB.save('duel', 'from B', Date.now() + 20_000);
    const conflicts: string[] = [];
    b.cloud.on('conflict', ({ kept }) => conflicts.push(`B kept ${kept}`));
    await b.cloud.sync(); // nothing changed remotely: B uploads
    a.cloud.on('conflict', ({ kept }) => conflicts.push(`A kept ${kept}`));
    a.cloud.onConflict(({ remote }) => (text(remote.data) === 'from B' ? 'remote' : 'local'));
    await a.cloud.sync();
    expect(savesA.read('duel')).toBe('from B');
    expect(conflicts).toEqual(['A kept remote']);
  });
});

describe('cloud saves on Steam Cloud', () => {
  it('writes slots and their time to Steam Cloud and reads them back', async () => {
    const files = new Map<string, string>();
    const steam = (method: string, ...args: unknown[]) => {
      if (method === 'cloudWrite') return void files.set(args[0] as string, args[1] as string);
      if (method === 'cloudRead') return files.get(args[0] as string) ?? null;
      if (method === 'cloudList') return [...files.keys()].map((name) => ({ name }));
      throw new Error(method);
    };
    const pcA = desktop(GAME_ID, { steam: true });
    pcA.natives.steam = steam;
    const savesA = new FakeSaves();
    const a = await device(pcA, savesA, { http: {}, 'cloud-save': { backend: 'steam' } });
    const sent = next(a.cloud, 'uploaded');
    await savesA.save('slot1', 'steam data');
    await sent;
    expect([...files.keys()].sort()).toEqual(['slot1', 'slot1.meta']);

    const pcB = desktop(GAME_ID, { steam: true });
    pcB.natives.steam = steam;
    const savesB = new FakeSaves();
    const b = await device(pcB, savesB, { http: {}, 'cloud-save': { backend: 'steam' } });
    await b.cloud.sync();
    expect(savesB.read('slot1')).toBe('steam data');
  });

  it('explains what is missing without a server', async () => {
    await expect(
      device(desktop(GAME_ID), new FakeSaves(), { http: {}, 'cloud-save': {} }),
    ).rejects.toThrow(/needs `server`/);
  });
});
