import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { ModuleHost, WebPlatform, type Game, type Platform } from '@blacklight/core';
import { http } from '@blacklight/module-http';
import { accountsOidc, type Accounts } from '../src/index';
import { checkIdToken, decodeJwt } from '../src/oidc';
import { secureStore } from '../src/secure';
import { desktop as desktopPlatform, type DesktopPlatform } from './platform';
import { startMockProvider, type MockProvider } from '../src/testing';

const GAME_ID = 'com.example.test';
let provider: MockProvider;
let hosts: ModuleHost[] = [];

beforeAll(async () => {
  provider = await startMockProvider({
    clients: [{ clientId: 'test-game', redirectUris: [`${GAME_ID}:/oauth/callback`] }],
  });
});
afterAll(() => provider.close());
afterEach(async () => {
  for (const host of hosts) await host.dispose();
  hosts = [];
});

function desktop(keystore = new Map<string, string>()): DesktopPlatform {
  return desktopPlatform(GAME_ID, { keystore });
}

async function start(platform: Platform, options: object): Promise<Accounts> {
  const game = {
    config: { id: GAME_ID, modules: { http: {}, 'accounts-oidc': options } },
    platform,
  } as unknown as Game;
  const host = new ModuleHost(game);
  hosts.push(host);
  await host.install({ definitions: [accountsOidc, http] });
  return host.apis['accounts-oidc'] as Accounts;
}

describe('accounts-oidc on desktop', () => {
  it('signs in with PKCE through the system browser and the custom scheme', async () => {
    const platform = desktop();
    const accounts = await start(platform, { issuer: provider.issuer, clientId: 'test-game' });
    expect(accounts.loggedIn).toBe(false);
    const user = await accounts.login();
    expect(user).toMatchObject({ sub: 'user-1', name: 'Test Player', issuer: provider.issuer });
    const authorize = new URL(platform.opened[0]!);
    expect(authorize.searchParams.get('code_challenge_method')).toBe('S256');
    expect(authorize.searchParams.get('redirect_uri')).toBe(`${GAME_ID}:/oauth/callback`);
    expect(authorize.searchParams.get('scope')).toBe('openid profile offline_access');
    // The refresh token lives in the OS keystore, nowhere else.
    expect([...platform.keystore.keys()]).toEqual([`${GAME_ID}.accounts.refresh`]);
    expect(await accounts.accessToken()).toMatch(/.+/);
  });

  it('stays signed in after a restart and refreshes with rotation', async () => {
    const keystore = new Map<string, string>();
    const first = await start(desktop(keystore), {
      issuer: provider.issuer,
      clientId: 'test-game',
    });
    await first.login();
    const firstRefresh = keystore.get(`${GAME_ID}.accounts.refresh`);
    await hosts.pop()!.dispose();

    const second = await start(desktop(keystore), {
      issuer: provider.issuer,
      clientId: 'test-game',
    });
    const token = await second.accessToken();
    expect(token).toMatch(/.+/);
    expect(keystore.get(`${GAME_ID}.accounts.refresh`)).not.toBe(firstRefresh);
    expect(second.user?.sub).toBe('user-1');
  });

  it('signs out when the provider refuses the refresh token', async () => {
    const keystore = new Map([[`${GAME_ID}.accounts.refresh`, 'revoked-token']]);
    const accounts = await start(desktop(keystore), {
      issuer: provider.issuer,
      clientId: 'test-game',
    });
    const expired = new Promise<void>((resolve) => accounts.on('expired', resolve));
    expect(await accounts.accessToken()).toBeUndefined();
    await expired;
    expect(keystore.size).toBe(0);
  });

  it('refuses an answer from the wrong state and explains a cancelled login', async () => {
    const platform = desktop();
    const web = Object.getPrototypeOf(platform) as WebPlatform;
    platform.openUrl = async (url: string) => {
      const state = new URL(url).searchParams.get('state');
      setTimeout(() => {
        web.emit('deeplink', `${GAME_ID}:/oauth/callback?state=other&code=x`);
        web.emit(
          'deeplink',
          `${GAME_ID}:/oauth/callback?state=${state}&error=access_denied&error_description=no`,
        );
      }, 5);
    };
    const accounts = await start(platform, { issuer: provider.issuer, clientId: 'test-game' });
    await expect(accounts.login()).rejects.toThrow('The login was cancelled.');
  });

  it('requires an issuer, with or without the preset: the engine has no default provider', async () => {
    await expect(start(desktop(), { clientId: 'x' })).rejects.toThrow(
      /needs `issuer`, the URL of your OpenID Connect provider.*remove the module/,
    );
    await expect(start(desktop(), { preset: 'blacklight', clientId: 'x' })).rejects.toThrow(
      /`preset: "blacklight"` only sets scopes and the consent prompt; it has no default server/,
    );
  });

  it('applies the BlackLight preset to the configured issuer', async () => {
    const platform = desktop();
    const accounts = await start(platform, {
      preset: 'blacklight',
      issuer: provider.issuer,
      clientId: 'test-game',
    });
    expect(accounts.loggedIn).toBe(false);
    await accounts.login();
    const authorize = new URL(platform.opened[0]!);
    expect(authorize.origin).toBe(new URL(provider.issuer).origin);
    expect(authorize.searchParams.get('prompt')).toBe('consent');
    expect(authorize.searchParams.get('scope')).toBe('openid profile offline_access');
  });
});

describe('linking with the game server', () => {
  let server: Server;
  let url: string;
  const calls: { path: string; body: string; authorization?: string }[] = [];
  beforeAll(async () => {
    server = createServer(async (req, res) => {
      let body = '';
      for await (const chunk of req) body += String(chunk);
      calls.push({ path: req.url!, body, authorization: req.headers.authorization });
      res.writeHead(200, { 'content-type': 'application/json' });
      const guest = req.url === '/v1/auth/guest';
      res.end(
        JSON.stringify({
          token: guest ? 'guest-session' : 'linked-session',
          expiresAt: Date.now() + 3_600_000,
          account: {
            id: 'acc-1',
            name: 'tester',
            identities: guest ? [] : [{ issuer: provider.issuer, subject: 'user-1' }],
          },
        }),
      );
    });
    await new Promise<void>((resolve) => server.listen(0, resolve));
    url = `http://localhost:${(server.address() as AddressInfo).port}`;
  });
  afterAll(() => new Promise<void>((resolve) => server.close(() => resolve())));

  it('links a guest account to the provider identity and authorizes server requests', async () => {
    const accounts = await start(desktop(), {
      issuer: provider.issuer,
      clientId: 'test-game',
      server: url,
    });
    const guest = await accounts.playAsGuest();
    expect(guest.identities).toEqual([]);
    await accounts.login();
    const link = calls.find((c) => c.path === '/v1/auth/oidc')!;
    expect(link.authorization).toBe('Bearer guest-session');
    const claims = decodeJwt(JSON.parse(link.body).idToken as string);
    expect(claims).toMatchObject({ sub: 'user-1', aud: 'test-game' });
    expect(accounts.serverAccount?.identities).toHaveLength(1);
    expect(await accounts.serverToken()).toBe('linked-session');
  });
});

describe('protocol helpers', () => {
  it('checks issuer, audience, nonce and expiry of ID tokens', () => {
    const claims = decodeJwt(provider.idToken('game', { nonce: 'n1' }));
    expect(() =>
      checkIdToken(claims, { issuer: provider.issuer, clientId: 'game', nonce: 'n1' }),
    ).not.toThrow();
    expect(() =>
      checkIdToken(claims, { issuer: 'https://evil', clientId: 'other', nonce: 'n2' }),
    ).toThrow(/wrong issuer "http:\/\/localhost:\d+", audience, nonce/);
    const old = decodeJwt(provider.idToken('game', { exp: 1 }));
    expect(() => checkIdToken(old, { issuer: provider.issuer, clientId: 'game' })).toThrow(
      /expiry/,
    );
  });

  it('encrypts web secrets with the per-install key', async () => {
    const platform = new WebPlatform(GAME_ID);
    const store = secureStore(platform, 'game.accounts');
    await store.set('refresh', 'secret-token');
    const [file] = await platform.files.list('secure/');
    const raw = new TextDecoder().decode(await platform.files.read(file!));
    expect(raw).not.toContain('secret-token');
    expect(await store.get('refresh')).toBe('secret-token');
    await store.remove('refresh');
    expect(await store.get('refresh')).toBeUndefined();
  });
});
