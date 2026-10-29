import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { ModuleHost, WebPlatform, type Game, type Platform } from '@blacklight/core';
import { http } from '@blacklight/module-http';
import { accountsOidc, type Accounts } from '../../accounts-oidc/src/index';
import { startMockProvider, type MockProvider } from '../../accounts-oidc/src/testing';
import { desktop } from '../../accounts-oidc/test/platform';
import { spawnReferenceServer, type SpawnedServer } from '../../../../servers/reference/test/spawn';
import { achievements, type Achievements } from '../src/index';

const GAME_ID = 'com.example.test';
let hosts: ModuleHost[] = [];
afterEach(async () => {
  for (const host of hosts) await host.dispose();
  hosts = [];
});

async function start(
  platform: Platform,
  modules: Record<string, object>,
  dev = true,
): Promise<{ achievements: Achievements; accounts?: Accounts; host: ModuleHost }> {
  const game = { config: { id: GAME_ID, modules }, platform } as unknown as Game;
  const host = new ModuleHost(game);
  hosts.push(host);
  const definitions = [http, achievements, ...('accounts-oidc' in modules ? [accountsOidc] : [])];
  await host.install({ definitions, dev });
  return {
    achievements: host.apis.achievements as Achievements,
    accounts: host.apis['accounts-oidc'] as Accounts | undefined,
    host,
  };
}

describe('achievements on the device only', () => {
  it('unlocks once, tracks progress and keeps both after a restart', async () => {
    const platform = new WebPlatform(GAME_ID);
    const first = await start(platform, { http: {}, achievements: { ids: ['win', 'collect'] } });
    expect(first.achievements.backend).toBe('local');
    const seen: string[] = [];
    first.achievements.on('unlock', ({ id }) => seen.push(id));
    expect(await first.achievements.unlock('win')).toBe(true);
    expect(await first.achievements.unlock('win')).toBe(false);
    await first.achievements.progress('collect', 3, 10);
    await expect(first.achievements.unlock('wim')).rejects.toThrow(/Unknown achievement "wim"/);
    await hosts.pop()!.dispose();

    const second = await start(platform, { http: {}, achievements: { ids: ['win', 'collect'] } });
    expect(second.achievements.isUnlocked('win')).toBe(true);
    expect(second.achievements.progressOf('collect')).toEqual({ current: 3, max: 10 });
    await second.achievements.progress('collect', 12, 10);
    expect(second.achievements.list().map((a) => a.id)).toEqual(['win', 'collect']);
    expect(seen).toEqual(['win']);
    await expect(second.achievements.leaderboard('top')).rejects.toThrow(/need a backend/);
    await second.achievements.reset();
    expect(second.achievements.list()).toEqual([]);
  });

  it('refuses reset outside development builds', async () => {
    const { achievements: api } = await start(
      new WebPlatform(GAME_ID),
      { http: {}, achievements: {} },
      false,
    );
    await expect(api.reset()).rejects.toThrow(/development builds/);
  });
});

describe('achievements on Steam', () => {
  it('calls the steam native module and queues while Steam is not answering', async () => {
    const platform = desktop(GAME_ID, { steam: true });
    const calls: unknown[][] = [];
    let running = false;
    platform.natives.steam = (method, ...args) => {
      if (!running) throw new TypeError('Steam is not running');
      calls.push([method, ...args]);
      return method === 'getScores' ? [{ rank: 1, name: 'ann', score: 5 }] : undefined;
    };
    const { achievements: api } = await start(platform, { http: {}, achievements: {} });
    expect(api.backend).toBe('steam');
    await api.unlock('win');
    await api.submitScore('top', 5);
    expect(api.pending).toBe(2);
    running = true;
    await api.sync();
    expect(calls).toEqual([
      ['activateAchievement', 'win'],
      ['uploadScore', 'top', 5],
    ]);
    expect(await api.leaderboard('top', { limit: 3 })).toEqual([
      { rank: 1, name: 'ann', score: 5 },
    ]);
  });
});

describe('achievements on the reference server', () => {
  let provider: MockProvider;
  let server: SpawnedServer;
  beforeAll(async () => {
    provider = await startMockProvider();
    server = await spawnReferenceServer(
      { [GAME_ID]: { achievements: ['win', 'collect'], leaderboards: { top: { order: 'desc' } } } },
      [{ issuer: provider.issuer, audiences: ['test-game'] }],
    );
  });
  afterAll(async () => {
    await server.stop();
    await provider.close();
  });

  const modules = () => ({
    http: {},
    'accounts-oidc': { issuer: provider.issuer, clientId: 'test-game', server: server.url },
    achievements: {},
  });

  it('keeps unlocks until the player signs in, then delivers them and syncs other devices', async () => {
    const device = await start(desktop(GAME_ID), modules());
    expect(device.achievements.backend).toBe('server');
    await device.achievements.unlock('win');
    await device.achievements.submitScore('top', 1200);
    await device.achievements.sync().catch(() => undefined);
    expect(device.achievements.pending).toBe(2); // no session yet: the server answers 401

    await device.accounts!.login();
    await device.achievements.sync();
    expect(device.achievements.pending).toBe(0);
    expect(await device.achievements.leaderboard('top')).toEqual([
      { rank: 1, name: 'tester', score: 1200 },
    ]);

    // Another device, same player: the unlock comes from the server.
    const other = await start(desktop(GAME_ID), modules());
    await other.accounts!.login();
    expect(other.achievements.isUnlocked('win')).toBe(false);
    await other.achievements.sync();
    expect(other.achievements.isUnlocked('win')).toBe(true);
  });

  it('drops unlocks the server does not know', async () => {
    const device = await start(desktop(GAME_ID), modules());
    await device.accounts!.login();
    await device.achievements.unlock('typo');
    await device.achievements.sync();
    expect(device.achievements.pending).toBe(0);
  });
});
