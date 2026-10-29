import { startMockProvider, type MockProvider } from '@blacklight/module-accounts-oidc/testing';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createReferenceServer, type ReferenceServer } from '../src/server.ts';

const GAME = 'com.example.game';
const SECRET = 'a-test-secret-that-is-long-enough-for-hmac';
let provider: MockProvider;
let other: MockProvider;
let ref: ReferenceServer;

beforeAll(async () => {
  provider = await startMockProvider();
  other = await startMockProvider();
  ref = await createReferenceServer({
    port: 0,
    database: ':memory:',
    sessionSecret: SECRET,
    providers: [{ issuer: provider.issuer, audiences: ['my-game'] }],
    games: {
      [GAME]: {
        achievements: ['first-win', 'collector'],
        leaderboards: { score: {}, speedrun: { order: 'asc' } },
        saveMaxBytes: 64,
      },
    },
  });
});

afterAll(async () => {
  await ref.close();
  await provider.close();
  await other.close();
});

async function call(
  method: string,
  path: string,
  options: { token?: string; body?: unknown; headers?: Record<string, string> } = {},
): Promise<{ status: number; body: Record<string, unknown> }> {
  const response = await fetch(`${ref.url}${path}`, {
    method,
    headers: {
      ...(options.token ? { authorization: `Bearer ${options.token}` } : {}),
      ...(options.body !== undefined ? { 'content-type': 'application/json' } : {}),
      ...options.headers,
    },
    body: options.body !== undefined ? JSON.stringify(options.body) : undefined,
  });
  const text = await response.text();
  return {
    status: response.status,
    body: text ? (JSON.parse(text) as Record<string, unknown>) : {},
  };
}

async function login(sub: string, token?: string) {
  provider.setUser({ sub, preferred_username: `user-${sub}`, email: `${sub}@example.com` });
  return call('POST', '/v1/auth/oidc', { token, body: { idToken: provider.idToken('my-game') } });
}

describe('accounts', () => {
  it('creates an account from an ID token and finds it again', async () => {
    const first = await login('alice');
    expect(first.status).toBe(200);
    const account = first.body.account as { id: string; name: string; identities: unknown[] };
    expect(account.name).toBe('user-alice');
    expect(account.identities).toEqual([{ issuer: provider.issuer, subject: 'alice' }]);
    expect(JSON.stringify(first.body)).not.toContain('@example.com');
    expect(first.body.expiresAt).toBeGreaterThan(Date.now());

    const again = await login('alice');
    expect((again.body.account as { id: string }).id).toBe(account.id);
    const me = await call('GET', '/v1/account', { token: again.body.token as string });
    expect(me.body.id).toBe(account.id);
  });

  it('links an identity to a guest account and refuses one linked elsewhere', async () => {
    const guest = await call('POST', '/v1/auth/guest');
    expect((guest.body.account as { name: string }).name).toMatch(/^Player-[0-9A-F]{4}$/);
    const token = guest.body.token as string;
    const linked = await login('bob', token);
    expect(linked.status).toBe(200);
    expect((linked.body.account as { id: string }).id).toBe(
      (guest.body.account as { id: string }).id,
    );
    expect((linked.body.account as { identities: unknown[] }).identities).toHaveLength(1);

    const another = await call('POST', '/v1/auth/guest');
    const conflict = await login('bob', another.body.token as string);
    expect(conflict.status).toBe(409);
    expect(conflict.body.error).toBe('identity_linked');

    const unlinked = await call(
      'DELETE',
      `/v1/account/identities?issuer=${encodeURIComponent(provider.issuer)}&subject=bob`,
      { token },
    );
    expect(unlinked.status).toBe(200);
    expect(unlinked.body.identities).toEqual([]);
  });

  it('refuses forged, expired, foreign and unknown-issuer tokens', async () => {
    const valid = provider.idToken('my-game', { sub: 'mallory' });
    const [header, payload, signature] = valid.split('.');
    const claims = JSON.parse(Buffer.from(payload!, 'base64url').toString()) as Record<
      string,
      unknown
    >;
    const forged = `${header}.${Buffer.from(JSON.stringify({ ...claims, sub: 'alice' })).toString('base64url')}.${signature}`;
    const cases = [
      forged,
      provider.idToken('my-game', { exp: Math.floor(Date.now() / 1000) - 3600 }),
      provider.idToken('another-game'),
      other.idToken('my-game'),
      'not-a-jwt',
    ];
    for (const idToken of cases) {
      const result = await call('POST', '/v1/auth/oidc', { body: { idToken } });
      expect(result.status).toBe(401);
      expect(result.body.error).toBe('invalid_token');
    }
    const missing = await call('POST', '/v1/auth/oidc', { body: {} });
    expect(missing.status).toBe(400);
  });

  it('deletes an account with its data and ends its sessions', async () => {
    const session = await login('carol');
    const token = session.body.token as string;
    await call('PUT', `/v1/games/${GAME}/saves/slot1`, {
      token,
      body: { data: 'AAEC', updatedAt: 1 },
    });
    expect((await call('DELETE', '/v1/account', { token })).status).toBe(204);
    expect((await call('GET', '/v1/account', { token })).status).toBe(401);
    const back = await login('carol');
    const fresh = back.body.token as string;
    expect((await call('GET', `/v1/games/${GAME}/saves`, { token: fresh })).body.saves).toEqual([]);
  });
});

describe('game data', () => {
  let token: string;
  beforeAll(async () => {
    token = (await login('dave')).body.token as string;
  });

  it('needs a session and a known game', async () => {
    expect((await call('GET', `/v1/games/${GAME}/saves`)).status).toBe(401);
    expect((await call('GET', `/v1/games/${GAME}/saves`, { token: 'x.y' })).status).toBe(401);
    const unknown = await call('GET', '/v1/games/com.example.other/saves', { token });
    expect(unknown.status).toBe(404);
    expect(unknown.body.error).toBe('unknown_game');
  });

  it('stores saves with revisions, conflicts and size limits', async () => {
    const path = `/v1/games/${GAME}/saves/main`;
    expect((await call('GET', path, { token })).status).toBe(404);
    const first = await call('PUT', path, {
      token,
      body: { data: 'AQID', updatedAt: 1000, baseRevision: 0 },
    });
    expect(first.body).toEqual({ slot: 'main', revision: 1, updatedAt: 1000, size: 3 });
    const read = await call('GET', path, { token });
    expect(read.body).toEqual({ slot: 'main', revision: 1, updatedAt: 1000, data: 'AQID' });

    const stale = await call('PUT', path, {
      token,
      body: { data: 'BAUG', updatedAt: 2000, baseRevision: 0 },
    });
    expect(stale.status).toBe(409);
    expect(stale.body.error).toBe('conflict');
    expect(stale.body.current).toEqual({ slot: 'main', revision: 1, updatedAt: 1000, size: 3 });

    const forced = await call('PUT', path, { token, body: { data: 'BAUG', updatedAt: 2000 } });
    expect(forced.body.revision).toBe(2);
    const list = await call('GET', `/v1/games/${GAME}/saves`, { token });
    expect(list.body.saves).toEqual([{ slot: 'main', revision: 2, updatedAt: 2000, size: 3 }]);

    const big = Buffer.alloc(65).toString('base64');
    expect((await call('PUT', path, { token, body: { data: big } })).status).toBe(413);
    expect(
      (await call('PUT', `/v1/games/${GAME}/saves/bad%20slot`, { token, body: { data: '' } }))
        .status,
    ).toBe(400);
    expect((await call('DELETE', path, { token })).status).toBe(204);
    expect((await call('GET', path, { token })).status).toBe(404);
  });

  it('unlocks achievements once and refuses unknown ids', async () => {
    const path = `/v1/games/${GAME}/achievements`;
    const first = await call('POST', `${path}/first-win`, { token, body: { unlockedAt: 5000 } });
    expect(first.body).toEqual({ id: 'first-win', unlockedAt: 5000 });
    const again = await call('POST', `${path}/first-win`, { token, body: { unlockedAt: 9000 } });
    expect(again.body.unlockedAt).toBe(5000);
    const unknown = await call('POST', `${path}/cheat`, { token, body: {} });
    expect(unknown.status).toBe(404);
    expect(unknown.body.error).toBe('unknown_achievement');
    expect((await call('GET', path, { token })).body.achievements).toEqual([
      { id: 'first-win', unlockedAt: 5000 },
    ]);
  });

  it('keeps the best score per player and ranks by the board order', async () => {
    const erin = (await login('erin')).body.token as string;
    const board = `/v1/games/${GAME}/leaderboards/score`;
    expect((await call('POST', `${board}/scores`, { token, body: { score: 100 } })).body).toEqual({
      best: 100,
      rank: 1,
    });
    expect((await call('POST', `${board}/scores`, { token, body: { score: 50 } })).body.best).toBe(
      100,
    );
    expect(
      (await call('POST', `${board}/scores`, { token: erin, body: { score: 150 } })).body.rank,
    ).toBe(1);
    const entries = (await call('GET', `${board}?limit=10`, { token })).body.entries as {
      rank: number;
      name: string;
      score: number;
    }[];
    expect(entries.map((e) => [e.rank, e.name, e.score])).toEqual([
      [1, 'user-erin', 150],
      [2, 'user-dave', 100],
    ]);
    expect((await call('GET', `${board}/me`, { token })).body).toEqual({ rank: 2, score: 100 });

    const speed = `/v1/games/${GAME}/leaderboards/speedrun`;
    await call('POST', `${speed}/scores`, { token, body: { score: 90.5 } });
    await call('POST', `${speed}/scores`, { token, body: { score: 120 } });
    await call('POST', `${speed}/scores`, { token: erin, body: { score: 80 } });
    expect((await call('GET', `${speed}/me`, { token })).body).toEqual({ rank: 2, score: 90.5 });

    expect((await call('POST', `${board}/scores`, { token, body: { score: 'lots' } })).status).toBe(
      400,
    );
    const unknown = await call('GET', `/v1/games/${GAME}/leaderboards/kills`, { token });
    expect(unknown.body.error).toBe('unknown_leaderboard');
  });
});

describe('http', () => {
  it('answers health checks and CORS preflights', async () => {
    expect((await call('GET', '/health')).body).toEqual({ ok: true });
    const preflight = await fetch(`${ref.url}/v1/account`, {
      method: 'OPTIONS',
      headers: { origin: 'https://game.example.com', 'access-control-request-method': 'GET' },
    });
    expect(preflight.status).toBe(204);
    expect(preflight.headers.get('access-control-allow-origin')).toBe('*');
    expect(preflight.headers.get('access-control-allow-headers')).toContain('Authorization');
  });

  it('limits requests per address and request bodies', async () => {
    const small = await createReferenceServer({
      port: 0,
      database: ':memory:',
      sessionSecret: SECRET,
      rateLimit: { requests: 3, windowMs: 60_000 },
      maxBodyBytes: 32,
    });
    try {
      const big = await fetch(`${small.url}/v1/auth/oidc`, {
        method: 'POST',
        body: JSON.stringify({ idToken: 'x'.repeat(100) }),
      });
      expect(big.status).toBe(413);
      const statuses: number[] = [];
      for (let i = 0; i < 3; i++) statuses.push((await fetch(`${small.url}/health`)).status);
      expect(statuses).toEqual([200, 200, 429]);
      expect(((await (await fetch(`${small.url}/health`)).json()) as { error: string }).error).toBe(
        'rate_limited',
      );
    } finally {
      await small.close();
    }
  });

  it('refuses a short session secret', async () => {
    await expect(
      createReferenceServer({ port: 0, database: ':memory:', sessionSecret: 'short' }),
    ).rejects.toThrow(/at least 32 characters/);
  });
});
