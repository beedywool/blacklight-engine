import { spawnSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { dirname, join, resolve } from 'node:path';
import type { CAC } from 'cac';
import { createServer, preview } from 'vite';
import pkg from '../../package.json' with { type: 'json' };
import { ALL_TARGETS, targets } from '../targets/index';
import { createViteConfig, generateTypes, prepareProject } from '../vite';

interface ServeOptions {
  port?: number;
  host?: string | boolean;
  open?: boolean;
  strictPort?: boolean;
}

/** create, dev, build, preview, types. */
export function registerCoreCommands(cli: CAC): void {
  cli
    .command('create [dir]', 'Create a new game (runs create-blacklight)')
    .allowUnknownOptions()
    .action(() => {
      const require = createRequire(import.meta.url);
      const createPkg = require.resolve('create-blacklight/package.json');
      const bin = join(dirname(createPkg), 'dist', 'index.js');
      const args = process.argv.slice(process.argv.indexOf('create') + 1);
      const result = spawnSync(process.execPath, [bin, ...args], { stdio: 'inherit' });
      process.exitCode = result.status ?? 1;
    });

  cli
    .command('dev [root]', 'Start the game with hot reload')
    .option('--port <port>', 'Port of the dev server', { default: 5173 })
    .option('--host [host]', 'Listen on the network (to test on a phone)')
    .option('--open', 'Open the browser')
    .option('--strict-port', 'Fail instead of trying the next port when it is taken')
    .action(async (root: string | undefined, options: ServeOptions) => {
      const server = await createServer(createViteConfig(resolve(root ?? '.'), options));
      await server.listen();
      server.printUrls();
      server.bindCLIShortcuts({ print: true });
    });

  cli
    .command('build [root]', 'Build the game for a target')
    .option('--target <target>', `One of: ${ALL_TARGETS.join(', ')}`, { default: 'web' })
    .option('--sign', 'Sign the build when certificates are configured')
    .option('--dry-run', 'Prepare signing and upload steps without running them')
    .allowUnknownOptions()
    .action(
      async (
        root: string | undefined,
        options: { target: string; sign?: boolean; dryRun?: boolean } & Record<string, unknown>,
      ) => {
        const target = options.target;
        if (!(ALL_TARGETS as readonly string[]).includes(target)) {
          throw new Error(`Unknown target "${target}". Use one of: ${ALL_TARGETS.join(', ')}.`);
        }
        const builder = targets[target];
        if (!builder) {
          throw new Error(
            `The "${target}" target is not available in @blacklight/cli ${pkg.version} yet; available: ${Object.keys(targets).join(', ')}.`,
          );
        }
        await builder({
          root: resolve(root ?? '.'),
          sign: options.sign,
          dryRun: options.dryRun,
          flags: options,
        });
      },
    );

  cli
    .command('preview [root]', 'Serve the last web build locally')
    .option('--port <port>', 'Port', { default: 4173 })
    .option('--host [host]', 'Listen on the network')
    .action(async (root: string | undefined, options: ServeOptions) => {
      const server = await preview(createViteConfig(resolve(root ?? '.'), options));
      server.printUrls();
    });

  cli
    .command(
      'types [root]',
      'Check game.config.ts and write .blacklight/types.d.ts (scene, object, action, asset names)',
    )
    .action(async (root: string | undefined) => {
      const dir = resolve(root ?? '.');
      prepareProject(dir);
      await generateTypes(dir);
    });
}
