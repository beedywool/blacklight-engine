#!/usr/bin/env node
// `blacklight-registry validate|build`: run by the index repository's CI.
import { join, resolve } from 'node:path';
import { parseArgs } from 'node:util';
import { RegistryError, buildIndex, localPackuments, npmPackuments, validateIndex } from './build';

const USAGE = `Usage:
  blacklight-registry validate [dir] [--local <folder>...]
  blacklight-registry build [dir] --out <dir> [--local <folder>...]

[dir] is the index repository (holding entries/), default ".".
--local reads packages from local folders instead of npm (a package folder, or a folder of
package folders such as packages/modules).`;

async function main(): Promise<void> {
  const { values, positionals } = parseArgs({
    allowPositionals: true,
    options: {
      out: { type: 'string' },
      local: { type: 'string', multiple: true },
      help: { type: 'boolean', short: 'h' },
    },
  });
  const [command, dir = '.'] = positionals;
  if (values.help || !command) {
    console.log(USAGE);
    return;
  }
  const entries = join(resolve(dir), 'entries');
  const packument = values.local?.length
    ? localPackuments(values.local.map((folder) => resolve(folder)))
    : npmPackuments();

  if (command === 'validate') {
    const issues = await validateIndex(entries, { packument });
    if (issues.length > 0) throw new RegistryError(issues);
    console.log('The registry index is valid.');
  } else if (command === 'build') {
    if (!values.out)
      throw new Error('`build` needs --out <dir>, the folder to write the static API to.');
    const index = await buildIndex(entries, resolve(values.out), { packument });
    console.log(`Wrote ${index.modules.length} modules to ${resolve(values.out)}/v1/.`);
  } else {
    throw new Error(`Unknown command "${command}".\n\n${USAGE}`);
  }
}

main().catch((error: unknown) => {
  console.error(`blacklight-registry: ${error instanceof Error ? error.message : String(error)}`);
  process.exitCode = 1;
});
