import {
  cpSync,
  existsSync,
  readFileSync,
  readdirSync,
  renameSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { basename, join, resolve } from 'node:path';

/** Options of {@link scaffold}: which template to copy where, and how to pin the engine. */
export interface ScaffoldOptions {
  /** Folder to create. */
  dir: string;
  /** Template folder name. */
  template: string;
  /** Folder holding the templates. */
  templatesDir: string;
  /** Version written for engine dependencies (`^version`). */
  engineVersion: string;
  /**
   * Path to a local engine checkout. Engine dependencies become `link:` dependencies to its
   * packages, to try unpublished changes.
   */
  link?: string;
  /** Write into a folder that is not empty. */
  force?: boolean;
  /**
   * Files every project gets whatever the template (the build workflow, pnpm settings), copied
   * after the template without replacing its own files.
   */
  sharedDir?: string;
  /** `packageManager` written into package.json. @defaultValue {@link DEFAULT_PACKAGE_MANAGER} */
  packageManager?: string;
}

/** pnpm version written into new projects when the scaffolder does not run under pnpm. */
export const DEFAULT_PACKAGE_MANAGER = 'pnpm@12.16.1';

/**
 * Files published with a leading underscore because npm drops or ignores the dotted names:
 * `_gitignore` → `.gitignore`, `_github/` → `.github/`.
 */
const DOTTED = ['gitignore', 'github'];

/**
 * The pnpm version running the scaffolder (`pnpm create blacklight`), read from npm's user agent
 * (`npm_config_user_agent`), so the new project pins the pnpm its author already has. Returns
 * `undefined` under another package manager.
 *
 * @example
 * ```ts
 * import { packageManagerFromAgent } from 'create-blacklight';
 *
 * packageManagerFromAgent('pnpm/12.16.1 npm/? node/v24.11.0 linux x64'); // 'pnpm@12.16.1'
 * packageManagerFromAgent(process.env.npm_config_user_agent);
 * ```
 */
export function packageManagerFromAgent(agent: string | undefined): string | undefined {
  const match = /^pnpm\/(\d+\.\d+\.\d+)/.exec(agent ?? '');
  return match ? `pnpm@${match[1]}` : undefined;
}

/**
 * Template names available in `templatesDir` (its sub-folders), sorted.
 *
 * @example
 * ```ts
 * import { listTemplates } from 'create-blacklight';
 *
 * listTemplates('node_modules/create-blacklight/templates'); // ['2d-with-3d', 'empty', …]
 * ```
 */
export function listTemplates(templatesDir: string): string[] {
  return readdirSync(templatesDir, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .sort();
}

/**
 * Lowercase npm-safe package name from a folder name: characters npm refuses become `-`, and an
 * empty result falls back to `my-game`. {@link scaffold} writes it into the new `package.json`.
 *
 * @example
 * ```ts
 * import { packageName } from 'create-blacklight';
 *
 * packageName('../My Great Game'); // 'my-great-game'
 * ```
 */
export function packageName(dir: string): string {
  const name = basename(resolve(dir))
    .toLowerCase()
    .replace(/[^a-z0-9-~._]+/g, '-')
    .replace(/^[-._]+|-+$/g, '');
  return name || 'my-game';
}

function engineDependency(name: string, options: ScaffoldOptions): string {
  if (options.link) {
    // Modules live in packages/modules/<name> but are published as @blacklight/module-<name>.
    const folder =
      name === 'create-blacklight'
        ? 'create'
        : name.replace(/^@blacklight\/module-/, 'modules/').replace(/^@blacklight\//, '');
    return `link:${join(resolve(options.link), 'packages', folder)}`;
  }
  return `^${options.engineVersion}`;
}

/**
 * Copies a template into `dir` and turns it into a standalone project: shared files added, `_`
 * names renamed to their dotted form (`_gitignore` → `.gitignore`), the package renamed after the
 * folder, `packageManager` pinned, and `workspace:` engine dependencies replaced by
 * `^<engineVersion>` (or `link:` paths with `link`). This is what `pnpm create blacklight` runs.
 *
 * @returns The absolute path of the created project.
 * @throws Error when the template does not exist or `dir` is not empty (without `force`).
 *
 * @example
 * ```ts
 * import { scaffold } from 'create-blacklight';
 *
 * const target = scaffold({
 *   dir: 'my-game',
 *   template: 'empty',
 *   templatesDir: 'node_modules/create-blacklight/templates',
 *   engineVersion: '1.0.0',
 * });
 * ```
 */
export function scaffold(options: ScaffoldOptions): string {
  const target = resolve(options.dir);
  const templates = listTemplates(options.templatesDir);
  if (!templates.includes(options.template)) {
    throw new Error(
      `Unknown template "${options.template}". Available templates: ${templates.join(', ')}.`,
    );
  }
  if (existsSync(target) && readdirSync(target).length > 0 && !options.force) {
    throw new Error(
      `${target} is not empty. Choose another folder or pass --force to write into it.`,
    );
  }

  const source = join(options.templatesDir, options.template);
  const skip = /[\\/](node_modules|dist|\.blacklight)([\\/]|$)/;
  cpSync(source, target, {
    recursive: true,
    filter: (src) => !skip.test(src.slice(source.length)),
  });
  if (options.sharedDir) {
    cpSync(options.sharedDir, target, { recursive: true, force: false, errorOnExist: false });
  }
  for (const name of DOTTED) {
    const from = join(target, `_${name}`);
    if (!existsSync(from)) continue;
    const to = join(target, `.${name}`);
    if (existsSync(to)) cpSync(from, to, { recursive: true, force: false, errorOnExist: false });
    else renameSync(from, to);
    rmSync(from, { recursive: true, force: true });
  }

  const manifestPath = join(target, 'package.json');
  const manifest = JSON.parse(readFileSync(manifestPath, 'utf8')) as {
    name: string;
    packageManager?: string;
    dependencies?: Record<string, string>;
    devDependencies?: Record<string, string>;
  };
  manifest.name = packageName(target);
  // CI (pnpm/action-setup in the build workflow) installs the pnpm version named here.
  manifest.packageManager ??= options.packageManager ?? DEFAULT_PACKAGE_MANAGER;
  for (const deps of [manifest.dependencies, manifest.devDependencies]) {
    for (const [name, range] of Object.entries(deps ?? {})) {
      if (range.startsWith('workspace:')) deps![name] = engineDependency(name, options);
    }
  }
  writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);
  return target;
}
