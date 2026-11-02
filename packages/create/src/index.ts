#!/usr/bin/env node
import { readFileSync } from 'node:fs';
import { relative } from 'node:path';
import { createInterface } from 'node:readline/promises';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';
import { listTemplates, packageManagerFromAgent, releaseBaseUrl, scaffold } from './scaffold';

const templatesDir = fileURLToPath(new URL('../templates', import.meta.url));
const sharedDir = fileURLToPath(new URL('../shared', import.meta.url));
const { version } = JSON.parse(
  readFileSync(new URL('../package.json', import.meta.url), 'utf8'),
) as {
  version: string;
};

const USAGE = `Usage: create-blacklight [dir] [options]

Options:
  -t, --template <name>      Template to start from (default: empty)
      --engine-version <v>   Engine release to depend on (default: ${version}, this scaffolder's)
      --link <path>          Link the engine packages of a local checkout instead of a release
      --force                Write into a folder that is not empty
  -h, --help                 Show this help

The engine packages come from the GitHub release's tarballs; BLACKLIGHT_RELEASE_URL replaces the
folder URL of that release (a local copy, for tests).

Templates: ${listTemplates(templatesDir).join(', ')}`;

async function main(): Promise<void> {
  const { values, positionals } = parseArgs({
    allowPositionals: true,
    options: {
      template: { type: 'string', short: 't', default: 'empty' },
      link: { type: 'string' },
      'engine-version': { type: 'string' },
      force: { type: 'boolean', default: false },
      help: { type: 'boolean', short: 'h', default: false },
    },
  });
  if (values.help) {
    console.log(USAGE);
    return;
  }

  let dir = positionals[0];
  if (!dir) {
    const rl = createInterface({ input: process.stdin, output: process.stdout });
    dir = (await rl.question('Project folder (my-game): ')).trim() || 'my-game';
    rl.close();
  }

  const engineVersion = (values['engine-version'] ?? version).replace(/^v/, '');
  if (!/^\d+\.\d+\.\d+(-[0-9A-Za-z.-]+)?$/.test(engineVersion)) {
    throw new Error(
      `--engine-version ${values['engine-version']} is not a version; pass one such as 1.2.0 (the release tag without its v).`,
    );
  }
  const target = scaffold({
    dir,
    template: values.template,
    templatesDir,
    engineVersion,
    releaseUrl: releaseBaseUrl(engineVersion),
    link: values.link,
    force: values.force,
    sharedDir,
    packageManager: packageManagerFromAgent(process.env.npm_config_user_agent),
  });

  const cd = relative(process.cwd(), target) || '.';
  console.log(
    `\nCreated ${target} from the "${values.template}" template.\n\nNext:\n  cd ${cd}\n  pnpm install\n  pnpm dev\n`,
  );
}

main().catch((error: unknown) => {
  console.error(
    `\x1b[31mcreate-blacklight: ${error instanceof Error ? error.message : String(error)}\x1b[0m`,
  );
  process.exitCode = 1;
});
