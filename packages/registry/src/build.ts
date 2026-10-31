import { existsSync, mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { basename, join } from 'node:path';
import semver from 'semver';
import {
  MODULE_NAME,
  moduleNameOf,
  validatePackage,
  type ModuleManifest,
  type ModulePermission,
  type ModulePlatform,
  type PackageJson,
} from './manifest';

/**
 * One file of the index repository, `entries/<name>.json`.
 *
 * @example
 * ```json
 * { "name": "chat", "package": "blacklight-module-chat", "repository": "https://github.com/me/chat" }
 * ```
 */
export interface IndexEntry {
  /** Module name; equals the file name and the package's `blacklight.module`. */
  name: string;
  /** npm package that holds the module. */
  package: string;
  /** Source repository URL. */
  repository?: string;
  /** Maintained with the engine. */
  official?: boolean;
}

/** The parts of an npm packument (`GET https://registry.npmjs.org/<package>`) the index reads. */
export interface Packument {
  /** Package name. */
  name: string;
  /** Named versions; the index reads `latest`. */
  'dist-tags'?: {
    /** The version `npm install` picks. */
    latest?: string;
  };
  /** The `package.json` of every published version, by version. */
  versions: Record<string, PackageJson>;
}

/** Returns the packument of a package, `undefined` when it is not published. */
export type PackumentSource = (packageName: string) => Promise<Packument | undefined>;

/** One module in `v1/index.json`. */
export interface ModuleSummary {
  /** Module name, as in `blacklight add <name>`. */
  name: string;
  /** npm package that holds the module. */
  package: string;
  /** Latest version with a valid manifest. */
  version: string;
  /** The package's description (empty when it has none). */
  description: string;
  /** The package's keywords. */
  keywords: string[];
  /** Platforms the module runs on. */
  platforms: ModulePlatform[];
  /** What the module may do, shown before it is installed. */
  permissions: ModulePermission[];
  /** Semver range of `@blacklight/core` versions the module works with. */
  engine: string;
  /** Other modules it needs. */
  dependencies: string[];
  /** Maintained with the engine. */
  official: boolean;
  /** Source repository URL, from the package or the index entry. */
  repository?: string;
  /** SPDX license expression of the package. */
  license: string;
}

/** What a module declares for one published version. */
export interface VersionManifest {
  /** Semver range of `@blacklight/core` versions this version works with. */
  engine: string;
  /** Platforms it runs on. */
  platforms: ModulePlatform[];
  /** What it may do. */
  permissions: ModulePermission[];
  /** Other modules it needs. */
  dependencies: string[];
}

/** `v1/modules/<name>.json`. */
export interface ModuleDetail extends ModuleSummary {
  /** Every published version with a valid manifest. */
  versions: Record<string, VersionManifest>;
}

/** `v1/index.json`. */
export interface RegistryIndex {
  /** ISO date of the build. */
  generatedAt: string;
  /** Every listed module, sorted by name. */
  modules: ModuleSummary[];
}

/**
 * Thrown by {@link buildIndex} when the index repository is invalid. The message lists every
 * problem, one per line, so a pull request to the index shows all of them at once.
 *
 * @example
 * ```ts
 * try {
 *   await buildIndex('entries', 'public');
 * } catch (error) {
 *   if (error instanceof RegistryError) console.error(error.issues.join('\n'));
 *   process.exitCode = 1;
 * }
 * ```
 */
export class RegistryError extends Error {
  constructor(
    /** One readable line per problem, naming the entry file and what is wrong with it. */
    readonly issues: string[],
  ) {
    super(`The registry index is invalid:\n${issues.map((issue) => `  - ${issue}`).join('\n')}`);
    this.name = 'RegistryError';
  }
}

/**
 * Packuments from the npm registry.
 *
 * @example
 * ```ts
 * const packument = npmPackuments();
 * await packument('@blacklight/module-sqlite');
 * ```
 */
export function npmPackuments(
  options: { registry?: string; fetch?: typeof fetch } = {},
): PackumentSource {
  const base = (options.registry ?? 'https://registry.npmjs.org').replace(/\/+$/, '');
  const get = options.fetch ?? fetch;
  return async (packageName) => {
    // Scoped names keep their `@` and encode the slash, as the npm registry expects.
    const response = await get(`${base}/${packageName.replace('/', '%2F')}`, {
      headers: { accept: 'application/json' },
    });
    if (response.status === 404) return undefined;
    if (!response.ok) {
      throw new Error(`npm registry answered HTTP ${response.status} for ${packageName}`);
    }
    return (await response.json()) as Packument;
  };
}

/**
 * Packuments built from local package folders (their `package.json` as the only, latest version).
 * A folder without `package.json` contributes each of its subfolders, so `packages/modules` works.
 * Used to build an index from unpublished packages (tests, previews).
 *
 * @example
 * ```ts
 * buildIndex('index/entries', 'out', { packument: localPackuments(['packages/modules']) });
 * ```
 */
export function localPackuments(dirs: string[]): PackumentSource {
  const byName = new Map<string, Packument>();
  const add = (dir: string) => {
    const file = join(dir, 'package.json');
    if (!existsSync(file)) return false;
    const pkg = JSON.parse(readFileSync(file, 'utf8')) as PackageJson;
    if (typeof pkg.name === 'string' && typeof pkg.version === 'string') {
      byName.set(pkg.name, {
        name: pkg.name,
        'dist-tags': { latest: pkg.version },
        versions: { [pkg.version]: pkg },
      });
    }
    return true;
  };
  for (const dir of dirs) {
    if (add(dir) || !existsSync(dir)) continue;
    for (const child of readdirSync(dir)) {
      const path = join(dir, child);
      if (statSync(path).isDirectory()) add(path);
    }
  }
  return async (packageName) => byName.get(packageName);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/**
 * Reads `entries/*.json` and checks their shape, without contacting npm. Entries that cannot be
 * used are left out and reported in `issues`; {@link validateIndex} adds the npm checks.
 *
 * @example
 * ```ts
 * const { entries, issues } = readEntries('entries');
 * for (const issue of issues) console.error(issue);
 * ```
 */
export function readEntries(entriesDir: string): {
  /** The usable entries. */
  entries: IndexEntry[];
  /** One readable line per problem. */
  issues: string[];
} {
  const issues: string[] = [];
  const entries: IndexEntry[] = [];
  if (!existsSync(entriesDir)) {
    return {
      entries,
      issues: [
        `${entriesDir} does not exist: the index repository keeps one entries/<name>.json per module`,
      ],
    };
  }
  for (const file of readdirSync(entriesDir).sort()) {
    if (!file.endsWith('.json')) continue;
    const where = `entries/${file}`;
    let data: unknown;
    try {
      data = JSON.parse(readFileSync(join(entriesDir, file), 'utf8'));
    } catch (error) {
      issues.push(`${where} is not valid JSON: ${(error as Error).message}`);
      continue;
    }
    if (!isRecord(data)) {
      issues.push(`${where} must contain an object: { "name": "...", "package": "..." }`);
      continue;
    }
    const before = issues.length;
    const name = basename(file, '.json');
    if (data.name !== name) {
      issues.push(`${where}: \`name\` must equal the file name ("${name}")`);
    }
    if (!MODULE_NAME.test(name)) {
      issues.push(`${where}: module names use lowercase letters, digits and dashes`);
    }
    if (typeof data.package !== 'string' || moduleNameOf(data.package) !== name) {
      issues.push(
        `${where}: \`package\` must be "blacklight-module-${name}" or "@scope/blacklight-module-${name}"`,
      );
    }
    if (
      data.repository !== undefined &&
      (typeof data.repository !== 'string' || !/^https?:\/\//.test(data.repository))
    ) {
      issues.push(`${where}: \`repository\` must be an http(s) URL`);
    }
    if (data.official !== undefined && typeof data.official !== 'boolean') {
      issues.push(`${where}: \`official\` must be true or false`);
    }
    for (const key of Object.keys(data)) {
      if (!['name', 'package', 'repository', 'official'].includes(key)) {
        issues.push(
          `${where}: unknown field \`${key}\` (known: name, package, repository, official)`,
        );
      }
    }
    if (issues.length === before) entries.push(data as unknown as IndexEntry);
  }
  return { entries, issues };
}

function manifestOf(pkg: PackageJson): ModuleManifest {
  return pkg.blacklight as ModuleManifest;
}

function repositoryOf(pkg: PackageJson, entry: IndexEntry): string | undefined {
  if (entry.repository) return entry.repository;
  const repo = typeof pkg.repository === 'string' ? pkg.repository : pkg.repository?.url;
  return repo?.replace(/^git\+/, '').replace(/\.git$/, '');
}

interface Loaded {
  entry: IndexEntry;
  detail: ModuleDetail;
}

async function load(
  entriesDir: string,
  packument: PackumentSource,
): Promise<{ loaded: Loaded[]; issues: string[] }> {
  const { entries, issues } = readEntries(entriesDir);
  const loaded: Loaded[] = [];
  const packages = new Map<string, string>();
  for (const entry of entries) {
    const where = `entries/${entry.name}.json`;
    const other = packages.get(entry.package);
    if (other) {
      issues.push(
        `${where}: the package ${entry.package} is already listed by entries/${other}.json`,
      );
      continue;
    }
    packages.set(entry.package, entry.name);
    let doc: Packument | undefined;
    try {
      doc = await packument(entry.package);
    } catch (error) {
      issues.push(`${where}: could not read ${entry.package} (${(error as Error).message})`);
      continue;
    }
    if (!doc) {
      issues.push(
        `${where}: ${entry.package} is not published on npm; publish it before adding the entry`,
      );
      continue;
    }
    const versions: Record<string, VersionManifest> = {};
    for (const [version, pkg] of Object.entries(doc.versions ?? {})) {
      if (validatePackage(pkg).length > 0 || manifestOf(pkg).module !== entry.name) continue;
      const manifest = manifestOf(pkg);
      versions[version] = {
        engine: manifest.engine,
        platforms: manifest.platforms,
        permissions: manifest.permissions,
        dependencies: manifest.dependencies ?? [],
      };
    }
    const tagged = doc['dist-tags']?.latest;
    const latest =
      tagged && doc.versions[tagged]
        ? tagged
        : semver.rsort(Object.keys(doc.versions ?? {}).filter((v) => semver.valid(v)))[0];
    const latestPkg = latest ? doc.versions[latest] : undefined;
    if (!latest || !latestPkg) {
      issues.push(`${where}: ${entry.package} has no published version`);
      continue;
    }
    const problems = validatePackage(latestPkg);
    if (problems.length > 0) {
      issues.push(...problems.map((problem) => `${where}: ${entry.package}@${latest}: ${problem}`));
      continue;
    }
    const manifest = manifestOf(latestPkg);
    if (manifest.module !== entry.name) {
      issues.push(
        `${where}: ${entry.package}@${latest} declares the module "${manifest.module}", not "${entry.name}"`,
      );
      continue;
    }
    loaded.push({
      entry,
      detail: {
        name: entry.name,
        package: entry.package,
        version: latest,
        description: latestPkg.description ?? '',
        keywords: Array.isArray(latestPkg.keywords) ? latestPkg.keywords : [],
        platforms: manifest.platforms,
        permissions: manifest.permissions,
        engine: manifest.engine,
        dependencies: manifest.dependencies ?? [],
        official: entry.official === true,
        ...(repositoryOf(latestPkg, entry) ? { repository: repositoryOf(latestPkg, entry) } : {}),
        license: latestPkg.license ?? '',
        versions,
      },
    });
  }
  const names = new Set(loaded.map((l) => l.entry.name));
  for (const { entry, detail } of loaded) {
    for (const dependency of detail.dependencies) {
      if (!names.has(dependency) && !entries.some((e) => e.name === dependency)) {
        issues.push(
          `entries/${entry.name}.json: depends on the module "${dependency}", which has no entry in the index; add it first`,
        );
      }
    }
  }
  return { loaded, issues };
}

/**
 * Checks an index repository: entry files, packages published on npm with a valid manifest,
 * no duplicates, dependencies listed. Returns every problem (empty when valid). CI runs it on each
 * pull request.
 *
 * @example
 * ```ts
 * const issues = await validateIndex('entries', { packument: npmPackuments() });
 * ```
 */
export async function validateIndex(
  entriesDir: string,
  options: { packument?: PackumentSource } = {},
): Promise<string[]> {
  return (await load(entriesDir, options.packument ?? npmPackuments())).issues;
}

function summary(detail: ModuleDetail): ModuleSummary {
  const rest: Partial<ModuleDetail> = { ...detail };
  delete rest.versions;
  return rest as ModuleSummary;
}

/**
 * Validates the index repository and writes the static API into `outDir`: `v1/index.json` (every
 * module, sorted by name) and `v1/modules/<name>.json` (one module with all its versions). The
 * files can be served by any static host; packages stay on npm.
 *
 * @throws {@link RegistryError} listing every problem when the index is invalid.
 *
 * @example
 * ```ts
 * await buildIndex('entries', 'public', { packument: npmPackuments() });
 * ```
 */
export async function buildIndex(
  entriesDir: string,
  outDir: string,
  options: { packument?: PackumentSource; now?: Date } = {},
): Promise<RegistryIndex> {
  const { loaded, issues } = await load(entriesDir, options.packument ?? npmPackuments());
  if (issues.length > 0) throw new RegistryError(issues);
  const details = loaded.map((l) => l.detail).sort((a, b) => a.name.localeCompare(b.name));
  const index: RegistryIndex = {
    generatedAt: (options.now ?? new Date()).toISOString(),
    modules: details.map(summary),
  };
  mkdirSync(join(outDir, 'v1', 'modules'), { recursive: true });
  writeFileSync(join(outDir, 'v1', 'index.json'), `${JSON.stringify(index, null, 2)}\n`);
  for (const detail of details) {
    writeFileSync(
      join(outDir, 'v1', 'modules', `${detail.name}.json`),
      `${JSON.stringify(detail, null, 2)}\n`,
    );
  }
  return index;
}
