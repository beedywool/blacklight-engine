// `@blacklight/module-accounts-oidc/testing`: a small OpenID Connect provider for tests (Node only).
// It implements what the accounts module and the reference server use: discovery, authorization
// code with PKCE (S256 only, like BlackLight SSO), refresh token rotation, userinfo, JWKS and
// end-session. Every authorization is approved at once for the current user.
import { createHash, generateKeyPairSync, randomBytes, sign, type KeyObject } from 'node:crypto';
import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import type { AddressInfo } from 'node:net';

/** The signed-in user of the mock provider. */
export interface MockUser {
  sub: string;
  name?: string;
  preferred_username?: string;
  email?: string;
  email_verified?: boolean;
  picture?: string;
}

/** Options of {@link startMockProvider}. */
export interface MockProviderOptions {
  /** Port to listen on; `0` picks a free one. @defaultValue `0` */
  port?: number;
  /** Host name in the issuer URL. @defaultValue `'localhost'` */
  host?: string;
  /** Registered clients; omitted: any client id and redirect URI are accepted. */
  clients?: { clientId: string; redirectUris?: string[] }[];
  /** @defaultValue `{ sub: 'user-1', name: 'Test Player', preferred_username: 'tester', email: 'tester@example.com' }` */
  user?: MockUser;
  /** Access and ID token lifetime in seconds. @defaultValue `3600` */
  tokenLifetime?: number;
}

/** A running mock provider. */
export interface MockProvider {
  /** Issuer URL, e.g. `http://localhost:5352`. */
  readonly issuer: string;
  readonly port: number;
  /** Changes the user that the next authorization signs in. */
  setUser(user: MockUser): void;
  /** Signs an ID token for `audience` (tests that skip the browser flow). */
  idToken(audience: string, claims?: Partial<MockUser> & Record<string, unknown>): string;
  /** Makes every refresh token invalid (the player revoked the game's access). */
  revokeAll(): void;
  /** Paths requested so far, in order (`/authorize`, `/token`…). */
  readonly requests: string[];
  close(): Promise<void>;
}

interface PendingCode {
  clientId: string;
  redirectUri: string;
  challenge: string;
  nonce: string | undefined;
  scope: string;
  user: MockUser;
}

const b64url = (data: Buffer | string) => Buffer.from(data).toString('base64url');

function jwt(key: KeyObject, kid: string, claims: Record<string, unknown>): string {
  const header = b64url(JSON.stringify({ alg: 'RS256', typ: 'JWT', kid }));
  const payload = b64url(JSON.stringify(claims));
  const signature = sign('sha256', Buffer.from(`${header}.${payload}`), key);
  return `${header}.${payload}.${b64url(signature)}`;
}

async function body(req: IncomingMessage): Promise<URLSearchParams> {
  const chunks: Buffer[] = [];
  for await (const chunk of req) chunks.push(chunk as Buffer);
  return new URLSearchParams(Buffer.concat(chunks).toString('utf8'));
}

function send(res: ServerResponse, status: number, data: unknown): void {
  res.writeHead(status, { 'content-type': 'application/json', 'cache-control': 'no-store' });
  res.end(JSON.stringify(data));
}

/**
 * Starts a mock OpenID Connect provider.
 *
 * @example
 * ```ts
 * const provider = await startMockProvider({ port: 5352 });
 * // game.config.ts: modules: { 'accounts-oidc': { issuer: provider.issuer, clientId: 'my-game' } }
 * await provider.close();
 * ```
 */
export async function startMockProvider(options: MockProviderOptions = {}): Promise<MockProvider> {
  const { privateKey, publicKey } = generateKeyPairSync('rsa', { modulusLength: 2048 });
  const kid = b64url(randomBytes(8));
  const lifetime = options.tokenLifetime ?? 3600;
  let user: MockUser = options.user ?? {
    sub: 'user-1',
    name: 'Test Player',
    preferred_username: 'tester',
    email: 'tester@example.com',
    email_verified: true,
  };
  const codes = new Map<string, PendingCode>();
  const refreshTokens = new Map<string, { clientId: string; scope: string; user: MockUser }>();
  const accessTokens = new Map<string, MockUser>();
  const requests: string[] = [];
  let issuer = '';

  const clientOk = (clientId: string | null, redirectUri: string | null) => {
    if (!clientId) return false;
    if (!options.clients) return true;
    const client = options.clients.find((c) => c.clientId === clientId);
    return !!client && (!client.redirectUris || client.redirectUris.includes(redirectUri ?? ''));
  };

  const idToken = (audience: string, claims: Record<string, unknown> = {}) => {
    const now = Math.floor(Date.now() / 1000);
    return jwt(privateKey, kid, {
      iss: issuer,
      aud: audience,
      iat: now,
      exp: now + lifetime,
      ...user,
      ...claims,
    });
  };

  const issueTokens = (clientId: string, scope: string, who: MockUser, nonce?: string) => {
    const access = b64url(randomBytes(24));
    accessTokens.set(access, who);
    const result: Record<string, unknown> = {
      access_token: access,
      token_type: 'Bearer',
      expires_in: lifetime,
      scope,
      id_token: idToken(clientId, { ...who, ...(nonce ? { nonce } : {}) }),
    };
    if (scope.split(' ').includes('offline_access')) {
      const refresh = b64url(randomBytes(24));
      refreshTokens.set(refresh, { clientId, scope, user: who });
      result.refresh_token = refresh;
    }
    return result;
  };

  const server = createServer(async (req, res) => {
    // Web games call the token and userinfo endpoints from another origin.
    res.setHeader('access-control-allow-origin', '*');
    res.setHeader('access-control-allow-headers', 'authorization, content-type');
    if (req.method === 'OPTIONS') {
      res.writeHead(204).end();
      return;
    }
    const url = new URL(req.url ?? '/', issuer);
    requests.push(url.pathname);
    try {
      if (url.pathname === '/.well-known/openid-configuration') {
        send(res, 200, {
          issuer,
          authorization_endpoint: `${issuer}/authorize`,
          token_endpoint: `${issuer}/token`,
          userinfo_endpoint: `${issuer}/userinfo`,
          jwks_uri: `${issuer}/jwks`,
          end_session_endpoint: `${issuer}/session/end`,
          response_types_supported: ['code'],
          grant_types_supported: ['authorization_code', 'refresh_token'],
          code_challenge_methods_supported: ['S256'],
          id_token_signing_alg_values_supported: ['RS256'],
          scopes_supported: ['openid', 'profile', 'email', 'offline_access'],
          subject_types_supported: ['public'],
          token_endpoint_auth_methods_supported: ['none'],
        });
      } else if (url.pathname === '/jwks') {
        send(res, 200, {
          keys: [{ ...publicKey.export({ format: 'jwk' }), kid, alg: 'RS256', use: 'sig' }],
        });
      } else if (url.pathname === '/authorize') {
        const q = url.searchParams;
        const redirectUri = q.get('redirect_uri');
        if (!clientOk(q.get('client_id'), redirectUri) || !redirectUri) {
          send(res, 400, {
            error: 'invalid_client',
            error_description: 'unknown client or redirect_uri',
          });
          return;
        }
        const back = new URL(redirectUri);
        const fail = (error: string, description: string) => {
          back.searchParams.set('error', error);
          back.searchParams.set('error_description', description);
          if (q.get('state')) back.searchParams.set('state', q.get('state')!);
          res.writeHead(302, { location: back.toString() }).end();
        };
        if (q.get('response_type') !== 'code')
          return fail('unsupported_response_type', 'code only');
        if (q.get('code_challenge_method') !== 'S256' || !q.get('code_challenge')) {
          return fail('invalid_request', 'PKCE with S256 is required');
        }
        const code = b64url(randomBytes(24));
        codes.set(code, {
          clientId: q.get('client_id')!,
          redirectUri,
          challenge: q.get('code_challenge')!,
          nonce: q.get('nonce') ?? undefined,
          scope: q.get('scope') ?? 'openid',
          user,
        });
        back.searchParams.set('code', code);
        if (q.get('state')) back.searchParams.set('state', q.get('state')!);
        back.searchParams.set('iss', issuer);
        res.writeHead(302, { location: back.toString() }).end();
      } else if (url.pathname === '/token' && req.method === 'POST') {
        const form = await body(req);
        const grant = form.get('grant_type');
        if (grant === 'authorization_code') {
          const pending = codes.get(form.get('code') ?? '');
          codes.delete(form.get('code') ?? '');
          const verifier = form.get('code_verifier') ?? '';
          if (
            !pending ||
            pending.clientId !== form.get('client_id') ||
            pending.redirectUri !== form.get('redirect_uri') ||
            b64url(createHash('sha256').update(verifier).digest()) !== pending.challenge
          ) {
            send(res, 400, {
              error: 'invalid_grant',
              error_description: 'code, client, redirect_uri or verifier mismatch',
            });
            return;
          }
          send(res, 200, issueTokens(pending.clientId, pending.scope, pending.user, pending.nonce));
        } else if (grant === 'refresh_token') {
          const token = form.get('refresh_token') ?? '';
          const entry = refreshTokens.get(token);
          refreshTokens.delete(token); // rotation: each refresh token works once
          if (!entry || entry.clientId !== form.get('client_id')) {
            send(res, 400, {
              error: 'invalid_grant',
              error_description: 'refresh token expired or revoked',
            });
            return;
          }
          send(res, 200, issueTokens(entry.clientId, entry.scope, entry.user));
        } else {
          send(res, 400, { error: 'unsupported_grant_type' });
        }
      } else if (url.pathname === '/userinfo') {
        const token = (req.headers.authorization ?? '').replace(/^Bearer /, '');
        const who = accessTokens.get(token);
        if (!who) send(res, 401, { error: 'invalid_token' });
        else send(res, 200, who);
      } else if (url.pathname === '/session/end') {
        const back = url.searchParams.get('post_logout_redirect_uri');
        if (back) res.writeHead(302, { location: back }).end();
        else send(res, 200, { ok: true });
      } else {
        send(res, 404, { error: 'not_found' });
      }
    } catch (error) {
      send(res, 500, { error: 'server_error', error_description: String(error) });
    }
  });

  await new Promise<void>((resolve) => server.listen(options.port ?? 0, resolve));
  const port = (server.address() as AddressInfo).port;
  issuer = `http://${options.host ?? 'localhost'}:${port}`;

  return {
    issuer,
    port,
    requests,
    setUser: (next) => void (user = next),
    idToken,
    revokeAll: () => refreshTokens.clear(),
    close: () =>
      new Promise((resolve) => {
        server.closeAllConnections();
        server.close(() => resolve());
      }),
  };
}
