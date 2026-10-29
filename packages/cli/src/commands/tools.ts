import { resolve } from 'node:path';
import type { CAC } from 'cac';
import { createServer, type ViteDevServer } from 'vite';
import { formatDoctor, runDoctor, systemEnv } from '../doctor';
import { formatLint, lintProject } from '../lint';
import { ALL_TARGETS } from '../targets/index';
import { runners } from '../targets/runners';
import { createViteConfig } from '../vite';

const color = !!process.stdout.isTTY && !process.env.NO_COLOR;

function checkTarget(target: string): void {
  if (!(ALL_TARGETS as readonly string[]).includes(target))
    throw new Error(`Unknown target "${target}". Use one of: ${ALL_TARGETS.join(', ')}.`);
}

/**
 * `run --target web`: the dev server, with the browser opened on the game (set `BROWSER=none` to
 * keep it closed, as Vite does).
 */
export async function runWeb(root: string, port: number): Promise<ViteDevServer> {
  const server = await createServer(createViteConfig(root, { port, open: true }));
  await server.listen();
  server.printUrls();
  return server;
}

/** doctor, lint, run. */
export function registerToolCommands(cli: CAC): void {
  cli
    .command('doctor [root]', 'Check the tools and SDKs each target needs')
    .option('--target <target>', 'Check one target only (exit code 1 when it is not ready)')
    .option('--json', 'Print the report as JSON')
    .action((root: string | undefined, options: { target?: string; json?: boolean }) => {
      if (options.target) checkTarget(options.target);
      const reports = runDoctor(
        systemEnv(resolve(root ?? '.')),
        options.target ? [options.target] : undefined,
      );
      console.log(options.json ? JSON.stringify(reports, null, 2) : formatDoctor(reports, color));
      if (options.target && !reports[0]?.ready) process.exitCode = 1;
    });

  cli
    .command('lint [root]', "Check a game against the engine's rules")
    .option('--no-eslint', 'Skip ESLint even when eslint-plugin-blacklight is installed')
    .option('--json', 'Print the problems as JSON')
    .action(async (root: string | undefined, options: { eslint: boolean; json?: boolean }) => {
      const result = await lintProject(resolve(root ?? '.'), { eslint: options.eslint });
      console.log(options.json ? JSON.stringify(result, null, 2) : formatLint(result, color));
      if (result.issues.some((i) => i.severity === 'error')) process.exitCode = 1;
    });

  cli
    .command('run [root]', 'Run the game on a target: browser, desktop window, device or emulator')
    .option('--target <target>', `One of: ${ALL_TARGETS.join(', ')}`, { default: 'web' })
    .option('--device <id>', 'Device or emulator to use (mobile targets)')
    .option('--port <port>', 'Port of the dev server', { default: 5173 })
    .allowUnknownOptions()
    .action(
      async (
        root: string | undefined,
        options: { target: string; device?: string; port: number } & Record<string, unknown>,
      ) => {
        checkTarget(options.target);
        const dir = resolve(root ?? '.');
        if (options.target === 'web') {
          const server = await runWeb(dir, Number(options.port));
          server.bindCLIShortcuts({ print: true });
          return;
        }
        const runner = runners[options.target];
        if (!runner) {
          throw new Error(
            `No runner for the "${options.target}" target in this version of @blacklight/cli. ` +
              `Build it with \`blacklight build --target ${options.target}\` and start the output by hand, ` +
              `or check what the target needs with \`blacklight doctor --target ${options.target}\`.`,
          );
        }
        await runner({
          root: dir,
          device: options.device,
          port: Number(options.port),
          flags: options,
        });
      },
    );
}
