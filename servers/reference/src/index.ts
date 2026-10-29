// Entry point: reads the environment (see docs/guide/server.md) and starts the server.
import { readFileSync } from 'node:fs';
import { createReferenceServer, type GamesConfig, type ProviderConfig } from './server.ts';

function fail(message: string): never {
  console.error(`[reference] ${message}`);
  process.exit(1);
}

function json<T>(name: string, text: string): T {
  try {
    return JSON.parse(text) as T;
  } catch (error) {
    return fail(`${name} is not valid JSON: ${(error as Error).message}`);
  }
}

const env = process.env;
if (!env.SESSION_SECRET)
  fail('SESSION_SECRET is required. Generate one with `openssl rand -base64 48`.');

const providers = env.OIDC_PROVIDERS
  ? json<ProviderConfig[]>('OIDC_PROVIDERS', env.OIDC_PROVIDERS)
  : [];
if (
  !Array.isArray(providers) ||
  providers.some((p) => typeof p?.issuer !== 'string' || !Array.isArray(p.audiences))
) {
  fail('OIDC_PROVIDERS must be a JSON array of { "issuer": "...", "audiences": ["client-id"] }.');
}

let games: GamesConfig = {};
if (env.GAMES_FILE) {
  let text = '';
  try {
    text = readFileSync(env.GAMES_FILE, 'utf8');
  } catch (error) {
    fail(`cannot read GAMES_FILE ${env.GAMES_FILE}: ${(error as Error).message}`);
  }
  games = json<GamesConfig>('GAMES_FILE', text);
}

const cors =
  !env.CORS_ORIGINS || env.CORS_ORIGINS.trim() === '*'
    ? '*'
    : env.CORS_ORIGINS.split(',').map((o) => o.trim());

try {
  const { url } = await createReferenceServer({
    port: Number(env.PORT ?? 8080),
    dataDir: env.DATA_DIR ?? '/data',
    sessionSecret: env.SESSION_SECRET!,
    providers,
    games,
    corsOrigins: cors,
    maxBodyBytes: Number(env.MAX_BODY_BYTES ?? 2 * 1024 * 1024),
    trustProxy: env.TRUST_PROXY === 'true',
  });
  console.log(
    `[reference] listening on ${url} · ${Object.keys(games).length} game(s) · ${providers.length} identity provider(s)`,
  );
} catch (error) {
  fail((error as Error).message);
}
