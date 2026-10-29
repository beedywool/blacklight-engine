// Starts the reference server as its own process, as Docker runs it, for module and e2e tests.
import { spawn } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

/** A reference server running in a child process. */
export interface SpawnedServer {
  url: string;
  stop(): Promise<void>;
}

/**
 * Runs `node servers/reference/src/index.ts` with a temporary data folder.
 *
 * @param games - Content of GAMES_FILE.
 * @param providers - OIDC_PROVIDERS.
 * @param port - `0` for a free port.
 */
export async function spawnReferenceServer(
  games: Record<string, unknown>,
  providers: { issuer: string; audiences: string[] }[] = [],
  port = 0,
): Promise<SpawnedServer> {
  const dir = mkdtempSync(join(tmpdir(), 'blacklight-reference-'));
  writeFileSync(join(dir, 'games.json'), JSON.stringify(games));
  const entry = fileURLToPath(new URL('../src/index.ts', import.meta.url));
  const child = spawn(process.execPath, [entry], {
    env: {
      ...process.env,
      PORT: String(port),
      DATA_DIR: dir,
      GAMES_FILE: join(dir, 'games.json'),
      SESSION_SECRET: 'test-secret-test-secret-test-secret-42',
      OIDC_PROVIDERS: JSON.stringify(providers),
    },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  let output = '';
  const url = await new Promise<string>((resolve, reject) => {
    const timer = setTimeout(
      () => reject(new Error(`reference server did not start:\n${output}`)),
      10_000,
    );
    const read = (chunk: Buffer) => {
      output += chunk.toString();
      const match = /listening on (\S+)/.exec(output);
      if (match) {
        clearTimeout(timer);
        resolve(match[1]!);
      }
    };
    child.stdout.on('data', read);
    child.stderr.on('data', read);
    child.on('exit', (code) => reject(new Error(`reference server exited (${code}):\n${output}`)));
  });
  return {
    url,
    stop: () =>
      new Promise((resolve) => {
        child.once('exit', () => {
          rmSync(dir, { recursive: true, force: true });
          resolve();
        });
        child.kill();
      }),
  };
}
