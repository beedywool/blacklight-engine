// The reference server: cloud saves, achievements, leaderboards and account linking over OpenID
// Connect for Blacklight games (SVC-05). Plain node:http and node:sqlite, no dependencies.
import { mkdirSync } from 'node:fs';
import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { join } from 'node:path';
import { Store } from './db.ts';
import { HttpError, RateLimiter, applyCors, sendJson } from './http.ts';
import { IdTokenVerifier, type ProviderConfig } from './oidc.ts';
import { route, type Context, type GamesConfig } from './routes.ts';
import { Sessions } from './session.ts';

export type { ProviderConfig } from './oidc.ts';
export type { GameConfig, GamesConfig } from './routes.ts';

/** Options of {@link createReferenceServer}. */
export interface ServerOptions {
  /** Port to listen on; `0` picks a free one. @defaultValue `8080` */
  port?: number;
  /** Address to listen on. @defaultValue all interfaces */
  host?: string;
  /** Folder of the database file (`reference.db`); ignored when `database` is set. @defaultValue `'/data'` */
  dataDir?: string;
  /** Database file, or `':memory:'` (tests). */
  database?: string;
  /** Signs session tokens; at least 32 characters. */
  sessionSecret: string;
  /** Identity providers whose ID tokens are accepted. */
  providers?: ProviderConfig[];
  /** Games this server stores data for. */
  games?: GamesConfig;
  /** Allowed web origins, or `'*'`. @defaultValue `'*'` */
  corsOrigins?: string[] | '*';
  /** Largest request body in bytes. @defaultValue 2 MiB */
  maxBodyBytes?: number;
  /** Requests per client address and window. @defaultValue `{ requests: 300, windowMs: 60000 }` */
  rateLimit?: { requests: number; windowMs: number };
  /** Read the client address from `X-Forwarded-For` (behind a reverse proxy). @defaultValue `false` */
  trustProxy?: boolean;
  /** Replaces `fetch` for provider discovery and keys (tests). */
  fetch?: typeof fetch;
}

/** A running server. */
export interface ReferenceServer {
  server: Server;
  /** Base URL, e.g. `http://localhost:8080`. */
  url: string;
  close(): Promise<void>;
}

/**
 * Starts the reference server.
 *
 * @example
 * ```ts
 * const { url, close } = await createReferenceServer({
 *   port: 8080,
 *   database: ':memory:',
 *   sessionSecret: process.env.SESSION_SECRET!,
 *   providers: [{ issuer: 'https://sso.example.com', audiences: ['my-game'] }],
 *   games: { 'com.example.game': { achievements: ['first-win'], leaderboards: { score: {} } } },
 * });
 * ```
 */
export async function createReferenceServer(options: ServerOptions): Promise<ReferenceServer> {
  const sessions = new Sessions(options.sessionSecret ?? '');
  let database = options.database;
  if (!database) {
    const dir = options.dataDir ?? '/data';
    mkdirSync(dir, { recursive: true });
    database = join(dir, 'reference.db');
  }
  const store = new Store(database);
  const ctx: Context = {
    store,
    sessions,
    verifier: new IdTokenVerifier(options.providers ?? [], options.fetch),
    games: options.games ?? {},
    maxBodyBytes: options.maxBodyBytes ?? 2 * 1024 * 1024,
  };
  const cors = options.corsOrigins ?? '*';
  const limits = options.rateLimit ?? { requests: 300, windowMs: 60_000 };
  const limiter = new RateLimiter(limits.requests, limits.windowMs);

  const server = createServer(async (req, res) => {
    applyCors(req, res, cors);
    if (req.method === 'OPTIONS') {
      res.statusCode = 204;
      res.end();
      return;
    }
    try {
      const forwarded = options.trustProxy
        ? String(req.headers['x-forwarded-for'] ?? '')
            .split(',')[0]
            ?.trim()
        : '';
      if (!limiter.allow(forwarded || req.socket.remoteAddress || 'unknown')) {
        throw new HttpError(
          429,
          'rate_limited',
          'Too many requests from this address; wait a minute and try again.',
        );
      }
      await route(ctx, req, res, new URL(req.url ?? '/', 'http://localhost'));
    } catch (error) {
      if (res.headersSent) {
        res.end();
        return;
      }
      if (error instanceof HttpError) {
        sendJson(res, error.status, { error: error.code, message: error.message, ...error.extra });
      } else {
        console.error('[reference] request failed:', error);
        sendJson(res, 500, {
          error: 'server_error',
          message: 'The server failed to answer; see its log.',
        });
      }
    }
  });

  await new Promise<void>((resolve, reject) => {
    server.once('error', reject);
    server.listen(options.port ?? 8080, options.host, () => resolve());
  });
  const { port } = server.address() as AddressInfo;
  return {
    server,
    url: `http://localhost:${port}`,
    close: () =>
      new Promise((resolve) => {
        server.closeAllConnections();
        server.close(() => {
          store.close();
          resolve();
        });
      }),
  };
}
