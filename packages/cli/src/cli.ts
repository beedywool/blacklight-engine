#!/usr/bin/env node
import { spawnSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { dirname, join, resolve } from 'node:path';
import { cac } from 'cac';
import { build, createServer, preview } from 'vite';
import pkg from '../package.json' with { type: 'json' };
import { createViteConfig, generateTypes, prepareProject } from './vite';

const TARGETS = ['web', 'win', 'mac', 'linux', 'android', 'ios', 'steam'] as const;
type Target = (typeof TARGETS)[number];

interface ServeOptions {
  port?: number;
  host?: string | boolean;
  open?: boolean;
  strictPort?: boolean;
}

const cli = cac('blacklight');

cli
  .command('create [dir]', 'Create a new game (same as `pnpm create blacklight`)')
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
  .option('--target <target>', `One of: ${TARGETS.join(', ')}`, { default: 'web' })
  .action(async (root: string | undefined, options: { target: string }) => {
    const target = options.target as Target;
    if (!TARGETS.includes(target)) {
      throw new Error(`Unknown target "${options.target}". Use one of: ${TARGETS.join(', ')}.`);
    }
    if (target !== 'web') {
      throw new Error(
        `The "${target}" target is not available in @blacklight/cli ${pkg.version} yet; "web" is. Desktop, mobile and Steam builds arrive with their packages.`,
      );
    }
    await build(createViteConfig(resolve(root ?? '.')));
  });

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

cli.help();
cli.version(pkg.version);

try {
  cli.parse(process.argv, { run: false });
  await cli.runMatchedCommand();
} catch (error) {
  console.error(
    `\x1b[31mblacklight: ${error instanceof Error ? error.message : String(error)}\x1b[0m`,
  );
  process.exitCode = 1;
}
