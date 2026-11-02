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
  /** Engine release the project depends on: its tarballs are `<releaseUrl>/<package>-<version>.tgz`. */
  engineVersion: string;
  /**
   * Folder URL of the release assets. @defaultValue {@link releaseBaseUrl}(`engineVersion`), the
   * GitHub release `v<engineVersion>`
   */
  releaseUrl?: string;
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

/** GitHub repository whose releases hold the engine tarballs. */
export const RELEASE_REPOSITORY = 'beedywool/blacklight-engine';

/**
 * Folder URL of the assets of an engine release on GitHub, where every package is a `.tgz`.
 * The `BLACKLIGHT_RELEASE_URL` environment variable replaces it (a local copy of a release, for
 * tests); `create-blacklight` and `blacklight upgrade` read it.
 *
 * @param version - Engine version, with or without its `v`.
 * @param env - Environment to read `BLACKLIGHT_RELEASE_URL` from; `{}` ignores it.
 *
 * @example
 * ```ts
 * import { releaseBaseUrl } from 'create-blacklight';
 *
 * releaseBaseUrl('1.2.0'); // 'https://github.com/beedywool/blacklight-engine/releases/download/v1.2.0'
 * ```
 */
export function releaseBaseUrl(
  version: string,
  env: Record<string, string | undefined> = process.env,
): string {
  const override = env.BLACKLIGHT_RELEASE_URL?.trim();
  if (override) return override.replace(/\/+$/, '');
  return `https://github.com/${RELEASE_REPOSITORY}/releases/download/v${version.replace(/^v/, '')}`;
}

/**
 * File name of a package in a release, as `pnpm pack` names it.
 *
 * @example
 * ```ts
 * import { releaseAssetName } from 'create-blacklight';
 *
 * releaseAssetName('@blacklight/core', '1.2.0'); // 'blacklight-core-1.2.0.tgz'
 * ```
 */
export function releaseAssetName(packageName: string, version: string): string {
  return `${packageName.replace(/^@/, '').replace('/', '-')}-${version.replace(/^v/, '')}.tgz`;
}

/** One dependency moved to another release by {@link retargetRelease}. */
export interface ReleaseChange {
  /** Package name, such as `@blacklight/core`. */
  name: string;
  /** The tarball URL before. */
  from: string;
  /** The tarball URL after. */
  to: string;
}

/**
 * Rewrites the engine dependencies of a `package.json` that point at release tarballs
 * (`…/<package>-<version>.tgz`) to another release, in place. `link:` and registry versions are left
 * alone. `blacklight upgrade` runs it.
 *
 * @param baseUrl - Folder URL of the new release's assets ({@link releaseBaseUrl}).
 * @returns One entry per rewritten dependency.
 *
 * @example
 * ```ts
 * import { releaseBaseUrl, retargetRelease } from 'create-blacklight';
 *
 * const changes = retargetRelease(manifest, '1.3.0', releaseBaseUrl('1.3.0'));
 * ```
 */
export function retargetRelease(
  manifest: {
    dependencies?: Record<string, string>;
    devDependencies?: Record<string, string>;
    optionalDependencies?: Record<string, string>;
  },
  version: string,
  baseUrl: string,
): ReleaseChange[] {
  const changes: ReleaseChange[] = [];
  const base = baseUrl.replace(/\/+$/, '');
  for (const deps of [
    manifest.dependencies,
    manifest.devDependencies,
    manifest.optionalDependencies,
  ]) {
    for (const [name, spec] of Object.entries(deps ?? {})) {
      const prefix = releaseAssetName(name, '').slice(0, -'.tgz'.length);
      const file = spec.slice(spec.lastIndexOf('/') + 1);
      const isRelease =
        /^https?:\/\//.test(spec) &&
        file.startsWith(prefix) &&
        /^\d+\.\d+\.\d+(-[0-9A-Za-z.-]+)?\.tgz$/.test(file.slice(prefix.length));
      if (!isRelease) continue;
      const to = `${base}/${releaseAssetName(name, version)}`;
      if (to === spec) continue;
      deps![name] = to;
      changes.push({ name, from: spec, to });
    }
  }
  return changes;
}

/** pnpm version written into new projects when the scaffolder does not run under pnpm. */
export const DEFAULT_PACKAGE_MANAGER = 'pnpm@12.16.1';

/**
 * Files published with a leading underscore because npm drops or ignores the dotted names:
 * `_gitignore` → `.gitignore`, `_github/` → `.github/`.
 */
const DOTTED = ['gitignore', 'github'];

/**
 * The pnpm version running the scaffolder (`pnpm dlx …/create-blacklight.tgz`), read from npm's user agent
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
    // Forward slashes on every OS: pnpm reads them on Windows too, and package.json stays the same.
    return `link:${join(resolve(options.link), 'packages', folder).replaceAll('\\', '/')}`;
  }
  const base = (options.releaseUrl ?? releaseBaseUrl(options.engineVersion, {})).replace(
    /\/+$/,
    '',
  );
  return `${base}/${releaseAssetName(name, options.engineVersion)}`;
}

/**
 * Copies a template into `dir` and turns it into a standalone project: shared files added, `_`
 * names renamed to their dotted form (`_gitignore` → `.gitignore`), the package renamed after the
 * folder, `packageManager` pinned, and `workspace:` engine dependencies replaced by
 * the URLs of the release's tarballs (`<releaseUrl>/blacklight-core-<engineVersion>.tgz`, or `link:`
 * paths with `link`), so `pnpm install` fetches the engine from the GitHub release. This is what `create-blacklight` runs.
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
