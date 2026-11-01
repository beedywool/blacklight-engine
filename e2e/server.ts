import { spawn, spawnSync, type ChildProcess } from 'node:child_process';

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
  // running) would answer instead of this one: `preview` then moves to the next port and the test
  // silently checks an old build.
  // A server stopped a moment ago may still be closing: give it a few seconds.
  const freeBy = Date.now() + 5000;
  while ((await answers(port)) && Date.now() < freeBy)
    await new Promise((wait) => setTimeout(wait, 250));
  if (await answers(port))
    throw new Error(
      `Port ${port} already answers before \`pnpm ${script}\` starts: a server from an earlier attempt is still running. Use another port for the retry or stop that process.`,
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
  const stop = () => {
    if (!server.pid) return;
    if (shell) spawnSync('taskkill', ['/pid', String(server.pid), '/T', '/F']);
    else process.kill(-server.pid, 'SIGTERM');
  };
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

async function answers(port: number): Promise<boolean> {
  try {
    return (await fetch(`http://localhost:${port}/`)).ok;
  } catch {
    return false;
  }
}
