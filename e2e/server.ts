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
    try {
      if ((await fetch(`http://localhost:${port}/`)).ok) break;
    } catch {
      // not listening yet
    }
    await new Promise((wait) => setTimeout(wait, 250));
  }
  return stop;
}
