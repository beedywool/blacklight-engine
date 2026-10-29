#!/usr/bin/env node
import { cac } from 'cac';
import pkg from '../package.json' with { type: 'json' };
import { registerCoreCommands } from './commands/core';
import { registerRegistryCommands } from './commands/registry';

const cli = cac('blacklight');

// Each area registers its commands from its own file in commands/.
registerCoreCommands(cli);
registerRegistryCommands(cli);

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
