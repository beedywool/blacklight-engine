import { spawn, spawnSync, type ChildProcess } from 'node:child_process';
import { mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const shell = process.platform === 'win32';

/** Runs a command and throws when it fails. `env` adds variables to this process's environment. */
export function run(
  command: string,
  args: string[],
  cwd: string,
  env: Record<string, string> = {},
): void {
  const result = spawnSync(command, args, {
    cwd,
    stdio: 'inherit',
    shell,
    env: { ...process.env, ...env },
  });
  if (result.status !== 0) throw new Error(`${command} ${args.join(' ')} failed in ${cwd}`);
}

/**
 * Starts `pnpm <script> --port <port>` in `cwd` and waits until it answers. With `output`, the
 * server's stdout and stderr go to that callback instead of the test's console.
 */
export async function serve(
  cwd: string,
  script: 'dev' | 'preview',
  port: number,
  output?: (text: string) => void,
): Promise<() => void> {
  // A server left behind by an earlier attempt (a worker killed on Windows leaves its children
  // running; a worker whose teardown times out never runs afterAll) would answer instead of this
  // one: `preview` then moves to the next port and the test silently checks an old build, `dev`
  // refuses to start. serve() records the pid of every server it starts until stop() runs, so the
  // retry stops what the failed attempt left behind.
  // A server stopped a moment ago may still be closing: give it a few seconds.
  if (await answers(port)) kill(readPid(port));
  const freeBy = Date.now() + 10_000;
  while ((await answers(port)) && Date.now() < freeBy)
    await new Promise((wait) => setTimeout(wait, 250));
  if (await answers(port))
    throw new Error(
      `Port ${port} already answers before \`pnpm ${script}\` starts and no server started by an earlier attempt was found to stop: another process listens there. Stop it or use another port.`,
    );
  // Own process group on POSIX so stopping it also stops the Vite process pnpm starts.
  const server: ChildProcess = spawn(
    'pnpm',
    [script, '--port', String(port), ...(script === 'dev' ? ['--strict-port'] : [])],
    {
      cwd,
      shell,
      detached: !shell,
      stdio: output ? 'pipe' : 'inherit',
    },
  );
  if (output) {
    server.stdout!.on('data', (chunk: Buffer) => output(chunk.toString()));
    server.stderr!.on('data', (chunk: Buffer) => output(chunk.toString()));
  }
  let exited: number | null | undefined;
  server.on('exit', (code) => (exited = code));
  if (server.pid) writePid(port, server.pid);
  let stopped = false;
  const stop = () => {
    if (stopped) return;
    stopped = true;
    process.off('exit', stop);
    if (server.pid) kill(server.pid, 'SIGTERM');
    forgetPid(port);
  };
  // A worker that exits without running afterAll (teardown timeout) still stops its servers.
  process.on('exit', stop);
  // GitHub's Windows runner once took 65 s before Vite listened (2d-with-3d, after the template
  // builds of the same shard); elsewhere a few seconds.
  const limit = process.platform === 'win32' ? 120 : 60;
  const deadline = Date.now() + limit * 1000;
  for (;;) {
    if (exited !== undefined) throw new Error(`pnpm ${script} exited with ${exited}`);
    if (Date.now() > deadline) {
      // A server that answers later must not hold the port for the retry.
      stop();
      throw new Error(`pnpm ${script} did not answer in ${limit} s`);
    }
    if (await answers(port)) break;
    await new Promise((wait) => setTimeout(wait, 250));
  }
  return stop;
}

const pidDir = join(tmpdir(), 'blacklight-e2e-servers');
const pidFile = (port: number) => join(pidDir, `${port}.pid`);

function writePid(port: number, pid: number): void {
  mkdirSync(pidDir, { recursive: true });
  writeFileSync(pidFile(port), String(pid));
}

function readPid(port: number): number | undefined {
  try {
    const pid = Number(readFileSync(pidFile(port), 'utf8'));
    return Number.isInteger(pid) && pid > 0 ? pid : undefined;
  } catch {
    return undefined;
  }
}

function forgetPid(port: number): void {
  rmSync(pidFile(port), { force: true });
}

/** Stops a server and every process it started (pnpm → Vite). */
function kill(pid: number | undefined, signal: NodeJS.Signals = 'SIGKILL'): void {
  if (!pid) return;
  if (shell) {
    spawnSync('taskkill', ['/pid', String(pid), '/T', '/F']);
    return;
  }
  try {
    process.kill(-pid, signal);
  } catch {
    // Already gone.
  }
}

async function answers(port: number): Promise<boolean> {
  try {
    return (await fetch(`http://localhost:${port}/`)).ok;
  } catch {
    return false;
  }
}
