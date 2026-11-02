import { spawnSync } from 'node:child_process';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import type { CAC } from 'cac';
import {
  RELEASE_REPOSITORY,
  releaseBaseUrl,
  retargetRelease,
  type ReleaseChange,
} from 'create-blacklight';
import { linkedCheckout, packageManager } from './registry';

/** Options of {@link upgradeEngine}; `fetch`, `run` and `env` are replaceable for tests. */
export interface UpgradeOptions {
  /** Game folder (holds `package.json`). */
  root: string;
  /** Engine version to move to, with or without its `v`. @defaultValue the latest GitHub release */
  version?: string;
  /** Run the package manager after the rewrite. @defaultValue `true` */
  install?: boolean;
  fetch?: typeof fetch;
  run?: (command: string, args: string[], cwd: string) => void;
  env?: Record<string, string | undefined>;
  log?: (line: string) => void;
}

/** What {@link upgradeEngine} did. */
export interface UpgradeResult {
  version: string;
  changes: ReleaseChange[];
  /** Package manager command, when one ran. */
  command?: string[];
}

const VERSION = /^\d+\.\d+\.\d+(-[0-9A-Za-z.-]+)?$/;

/** Tag of the latest release of the engine on GitHub, without its `v`. */
export async function latestRelease(get: typeof fetch = fetch): Promise<string> {
  const url = `https://api.github.com/repos/${RELEASE_REPOSITORY}/releases/latest`;
  let response: Response;
  try {
    response = await get(url, { headers: { accept: 'application/vnd.github+json' } });
  } catch (error) {
    throw new Error(
      `Cannot reach GitHub (${url}): ${(error as Error).message}. Pass the version to upgrade to, e.g. \`blacklight upgrade 1.2.0\`.`,
      { cause: error },
    );
  }
  if (!response.ok) {
    throw new Error(
      `GitHub answered HTTP ${response.status} for ${url}. Pass the version to upgrade to, e.g. \`blacklight upgrade 1.2.0\`.`,
    );
  }
  const { tag_name: tag } = (await response.json()) as { tag_name?: string };
  const version = tag?.replace(/^v/, '');
  if (!version || !VERSION.test(version)) {
    throw new Error(`The latest release of ${RELEASE_REPOSITORY} has no version tag (${tag}).`);
  }
  return version;
}

function defaultRun(command: string, args: string[], cwd: string): void {
  const result = spawnSync(command, args, {
    cwd,
    stdio: 'inherit',
    shell: process.platform === 'win32',
  });
  if (result.status !== 0) {
    throw new Error(
      `\`${command} ${args.join(' ')}\` failed in ${cwd}; fix the error above and run it again.`,
    );
  }
}

/**
 * `blacklight upgrade [version]`: points every engine dependency of the game that comes from a
 * release tarball at the same package in another release, then reinstalls.
 *
 * @throws Error when the version is invalid, the game links a checkout, or nothing comes from a
 * release.
 *
 * @example
 * ```ts
 * await upgradeEngine({ root: process.cwd(), version: '1.2.0' });
 * ```
 */
export async function upgradeEngine(options: UpgradeOptions): Promise<UpgradeResult> {
  const root = resolve(options.root);
  const log = options.log ?? (() => {});
  const file = join(root, 'package.json');
  if (!existsSync(file)) {
    throw new Error(
      `No package.json in ${root}. Run \`blacklight upgrade\` from your game's folder.`,
    );
  }
  const version = options.version
    ? options.version.replace(/^v/, '')
    : await latestRelease(options.fetch);
  if (!VERSION.test(version)) {
    throw new Error(`"${options.version}" is not a version; pass one such as 1.2.0.`);
  }
  const text = readFileSync(file, 'utf8');
  const manifest = JSON.parse(text) as Parameters<typeof retargetRelease>[0];
  const base = releaseBaseUrl(version, options.env ?? process.env);
  const changes = retargetRelease(manifest, version, base);

  if (changes.length === 0) {
    const checkout = linkedCheckout(root);
    if (checkout) {
      throw new Error(
        `This game links the engine checkout at ${checkout} (create-blacklight --link): pull and rebuild the checkout instead.`,
      );
    }
    const onRelease = Object.values({ ...manifest.dependencies, ...manifest.devDependencies }).some(
      (spec) => spec.startsWith(`${base}/`),
    );
    if (!onRelease) {
      throw new Error(
        'No engine dependency in package.json comes from a release tarball (https://github.com/…/releases/download/v<version>/<package>-<version>.tgz); nothing to upgrade.',
      );
    }
    log(`The game already uses the engine ${version}.`);
    return { version, changes };
  }

  const indent = /^[ \t]+/m.exec(text)?.[0] ?? '  ';
  writeFileSync(file, `${JSON.stringify(manifest, null, indent)}\n`);
  for (const change of changes) log(`${change.name} → ${version}`);
  const result: UpgradeResult = { version, changes };
  if (options.install !== false) {
    const { command } = packageManager(root);
    result.command = [command, 'install'];
    (options.run ?? defaultRun)(command, ['install'], root);
  }
  log(`Upgraded the engine to ${version}. Read the changelog of the release for breaking changes.`);
  return result;
}

/** upgrade. */
export function registerUpgradeCommand(cli: CAC): void {
  cli
    .command(
      'upgrade [version]',
      'Move the engine packages to another GitHub release (default: the latest) and reinstall',
    )
    .option('--no-install', 'Rewrite package.json without running the package manager')
    .action(async (version: string | undefined, options: { install?: boolean }) => {
      await upgradeEngine({
        root: process.cwd(),
        version,
        install: options.install,
        log: (line) => console.log(line),
      });
    });
}
