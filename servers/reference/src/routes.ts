// The HTTP API (see docs/guide/server.md): accounts and identity linking, then per-game saves,
// achievements and leaderboards. Every game route needs a session.
import type { IncomingMessage, ServerResponse } from 'node:http';
import type { Account, Store } from './db.ts';
import { HttpError, readJson, sendJson } from './http.ts';
import { TokenError, type IdTokenVerifier } from './oidc.ts';
import type { Sessions } from './session.ts';

/** What the server knows about one game. Ids not listed here are refused (SPEC L4). */
export interface GameConfig {
  /** Achievement ids the game may unlock. */
  achievements?: string[];
  /** Leaderboards by id; `desc` (default): higher scores are better. */
  leaderboards?: Record<string, { order?: 'desc' | 'asc' }>;
  /** Largest save slot in bytes. @defaultValue 1 MiB */
  saveMaxBytes?: number;
}

/** Games by id (the reverse-domain `id` of `game.config.ts`). */
export type GamesConfig = Record<string, GameConfig>;

export interface Context {
  store: Store;
  sessions: Sessions;
  verifier: IdTokenVerifier;
  games: GamesConfig;
  maxBodyBytes: number;
}

const DEFAULT_SAVE_MAX = 1024 * 1024;
const SLOT = /^[A-Za-z0-9_.-]{1,64}$/;
const BASE64 = /^[A-Za-z0-9+/]*={0,2}$/;

function bearer(req: IncomingMessage): string | undefined {
  const header = req.headers.authorization;
  return header?.startsWith('Bearer ') ? header.slice(7).trim() : undefined;
}

/** The signed-in account, or `undefined` without a valid session. */
function sessionAccount(ctx: Context, req: IncomingMessage): Account | undefined {
  const token = bearer(req);
  const session = token ? ctx.sessions.check(token) : undefined;
  return session ? ctx.store.account(session.accountId) : undefined;
}

function requireAccount(ctx: Context, req: IncomingMessage): Account {
  const account = sessionAccount(ctx, req);
  if (!account) {
    throw new HttpError(
      401,
      'unauthorized',
      'Sign in first: send `Authorization: Bearer <token>` with a token from /v1/auth/oidc or /v1/auth/guest.',
    );
  }
  return account;
}

function signedIn(ctx: Context, account: Account) {
  return { ...ctx.sessions.issue(account.id), account };
}

function displayName(claims: { preferred_username?: unknown; name?: unknown }): string | undefined {
  const name = [claims.preferred_username, claims.name].find(
    (v) => typeof v === 'string' && v.trim() !== '',
  );
  return typeof name === 'string' ? name.trim().slice(0, 32) : undefined;
}

async function oidcLogin(ctx: Context, req: IncomingMessage) {
  const body = await readJson(req, ctx.maxBodyBytes);
  if (typeof body.idToken !== 'string' || body.idToken === '') {
    throw new HttpError(
      400,
      'invalid_body',
      'Send `{ "idToken": "<the ID token from the provider>" }`.',
    );
  }
  let claims;
  try {
    claims = await ctx.verifier.verify(body.idToken);
  } catch (error) {
    if (error instanceof TokenError)
      throw new HttpError(401, 'invalid_token', `ID token refused: ${error.message}.`);
    throw error;
  }
  const identity = { issuer: claims.iss.replace(/\/+$/, ''), subject: claims.sub };
  const name = displayName(claims);
  const current = sessionAccount(ctx, req);
  const owner = ctx.store.identityOwner(identity);

  if (current) {
    if (owner && owner !== current.id) {
      throw new HttpError(
        409,
        'identity_linked',
        'This identity is already linked to another account. Sign in with it instead, or unlink it from that account first.',
      );
    }
    if (!owner) ctx.store.link(current.id, identity);
    return signedIn(ctx, ctx.store.account(current.id)!);
  }
  if (owner) {
    if (name) ctx.store.rename(owner, name);
    return signedIn(ctx, ctx.store.account(owner)!);
  }
  const account = ctx.store.createAccount(name ?? 'Player');
  ctx.store.link(account.id, identity);
  return signedIn(ctx, ctx.store.account(account.id)!);
}

function gameOf(ctx: Context, id: string): GameConfig {
  const game = Object.hasOwn(ctx.games, id) ? ctx.games[id] : undefined;
  if (!game) {
    throw new HttpError(
      404,
      'unknown_game',
      `The game "${id}" is not configured on this server; add it to GAMES_FILE.`,
    );
  }
  return game;
}

function boardOf(game: GameConfig, board: string): 'asc' | 'desc' {
  const config =
    game.leaderboards && Object.hasOwn(game.leaderboards, board)
      ? game.leaderboards[board]
      : undefined;
  if (!config) {
    throw new HttpError(
      404,
      'unknown_leaderboard',
      `The leaderboard "${board}" is not configured for this game.`,
    );
  }
  return config.order ?? 'desc';
}

async function gameRoute(
  ctx: Context,
  req: IncomingMessage,
  res: ServerResponse,
  url: URL,
  gameId: string,
  rest: string[],
): Promise<void> {
  const game = gameOf(ctx, gameId);
  const account = requireAccount(ctx, req);
  const method = req.method;
  const [kind, id, sub, more] = rest;

  if (kind === 'saves') {
    if (id === undefined && method === 'GET') {
      return sendJson(res, 200, { saves: ctx.store.saves(account.id, gameId) });
    }
    if (id !== undefined && sub === undefined) {
      if (!SLOT.test(id)) {
        throw new HttpError(
          400,
          'invalid_slot',
          'Slot names use 1 to 64 letters, digits, ".", "_" or "-".',
        );
      }
      if (method === 'GET') {
        const save = ctx.store.save(account.id, gameId, id);
        if (!save) throw new HttpError(404, 'not_found', `No save in slot "${id}".`);
        const { data, slot, revision, updatedAt } = save;
        return sendJson(res, 200, { slot, revision, updatedAt, data: data.toString('base64') });
      }
      if (method === 'PUT') {
        const body = await readJson(req, ctx.maxBodyBytes);
        if (typeof body.data !== 'string' || !BASE64.test(body.data)) {
          throw new HttpError(
            400,
            'invalid_body',
            'Send `{ "data": "<base64>", "updatedAt": <ms>, "baseRevision"?: <n> }`.',
          );
        }
        const data = Buffer.from(body.data, 'base64');
        const limit = game.saveMaxBytes ?? DEFAULT_SAVE_MAX;
        if (data.length > limit) {
          throw new HttpError(
            413,
            'too_large',
            `The save is ${data.length} bytes; this game allows ${limit}.`,
          );
        }
        if (body.baseRevision !== undefined) {
          const current = ctx.store.saveMeta(account.id, gameId, id);
          if (body.baseRevision !== (current?.revision ?? 0)) {
            throw new HttpError(
              409,
              'conflict',
              'The slot changed on the server since this copy was downloaded. Resolve the conflict, then send again with the current revision (or without baseRevision to overwrite).',
              { current: current ?? null },
            );
          }
        }
        const updatedAt =
          typeof body.updatedAt === 'number' && Number.isFinite(body.updatedAt)
            ? body.updatedAt
            : Date.now();
        return sendJson(res, 200, ctx.store.writeSave(account.id, gameId, id, data, updatedAt));
      }
      if (method === 'DELETE') {
        ctx.store.deleteSave(account.id, gameId, id);
        return sendJson(res, 204);
      }
    }
  }

  if (kind === 'achievements') {
    if (id === undefined && method === 'GET') {
      return sendJson(res, 200, { achievements: ctx.store.achievements(account.id, gameId) });
    }
    if (id !== undefined && sub === undefined && method === 'POST') {
      if (!game.achievements?.includes(id)) {
        throw new HttpError(
          404,
          'unknown_achievement',
          `The achievement "${id}" is not configured for this game.`,
        );
      }
      const body = await readJson(req, ctx.maxBodyBytes);
      const at =
        typeof body.unlockedAt === 'number' &&
        Number.isFinite(body.unlockedAt) &&
        body.unlockedAt <= Date.now()
          ? body.unlockedAt
          : Date.now();
      return sendJson(res, 200, { id, unlockedAt: ctx.store.unlock(account.id, gameId, id, at) });
    }
  }

  if (kind === 'leaderboards' && id !== undefined && more === undefined) {
    const order = boardOf(game, id);
    if (sub === 'scores' && method === 'POST') {
      const body = await readJson(req, ctx.maxBodyBytes);
      if (typeof body.score !== 'number' || !Number.isFinite(body.score)) {
        throw new HttpError(400, 'invalid_body', 'Send `{ "score": <finite number> }`.');
      }
      const best = ctx.store.submitScore(account.id, gameId, id, body.score, order);
      const mine = ctx.store.myScore(account.id, gameId, id, order)!;
      return sendJson(res, 200, { best, rank: mine.rank });
    }
    if (sub === 'me' && method === 'GET') {
      const mine = ctx.store.myScore(account.id, gameId, id, order);
      if (!mine) throw new HttpError(404, 'not_found', 'No score on this leaderboard yet.');
      return sendJson(res, 200, mine);
    }
    if (sub === undefined && method === 'GET') {
      const limit = Math.min(Math.max(Number(url.searchParams.get('limit') ?? 10) || 10, 1), 100);
      const offset = Math.max(Number(url.searchParams.get('offset') ?? 0) || 0, 0);
      return sendJson(res, 200, {
        entries: ctx.store.leaderboard(gameId, id, order, Math.floor(limit), Math.floor(offset)),
      });
    }
  }

  throw new HttpError(404, 'not_found', `No route for ${method} ${url.pathname}.`);
}

/** Answers one request (errors are thrown as {@link HttpError}). */
export async function route(
  ctx: Context,
  req: IncomingMessage,
  res: ServerResponse,
  url: URL,
): Promise<void> {
  const path = url.pathname.replace(/\/+$/, '') || '/';
  const method = req.method;

  if (path === '/health' && method === 'GET') return sendJson(res, 200, { ok: true });
  if (path === '/v1/auth/oidc' && method === 'POST')
    return sendJson(res, 200, await oidcLogin(ctx, req));
  if (path === '/v1/auth/guest' && method === 'POST')
    return sendJson(res, 200, signedIn(ctx, ctx.store.createGuest()));

  if (path === '/v1/account') {
    const account = requireAccount(ctx, req);
    if (method === 'GET') return sendJson(res, 200, account);
    if (method === 'DELETE') {
      ctx.store.deleteAccount(account.id);
      return sendJson(res, 204);
    }
  }
  if (path === '/v1/account/identities' && method === 'DELETE') {
    const account = requireAccount(ctx, req);
    const issuer = (url.searchParams.get('issuer') ?? '').replace(/\/+$/, '');
    const subject = url.searchParams.get('subject') ?? '';
    if (!ctx.store.unlink(account.id, { issuer, subject })) {
      throw new HttpError(404, 'not_found', 'This identity is not linked to your account.');
    }
    return sendJson(res, 200, ctx.store.account(account.id));
  }

  const parts = path.split('/').slice(1).map(decodeURIComponent);
  if (parts[0] === 'v1' && parts[1] === 'games' && parts[2] && parts.length >= 4) {
    return gameRoute(ctx, req, res, url, parts[2], parts.slice(3));
  }
  throw new HttpError(404, 'not_found', `No route for ${method} ${url.pathname}.`);
}
