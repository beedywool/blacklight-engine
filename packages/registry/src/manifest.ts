import semver from 'semver';

/** Platforms a module can run on. */
export const PLATFORMS = ['web', 'desktop', 'android', 'ios'] as const;
/** A platform a module can run on. */
export type ModulePlatform = (typeof PLATFORMS)[number];

/**
 * What a module may do, shown to the developer before `blacklight add` installs it:
 *
 * - `network`: talks to servers.
 * - `storage`: writes files on the device.
 * - `native`: has a native part (Node code in the Electron main process, a Capacitor plugin).
 * - `accounts`: handles sign-in tokens.
 * - `telemetry`: sends usage or crash data.
 */
export const PERMISSIONS = ['network', 'storage', 'native', 'accounts', 'telemetry'] as const;
/** A permission a module declares. */
export type ModulePermission = (typeof PERMISSIONS)[number];

/** Licenses accepted in the index (MIT-compatible, SPEC §9). */
export const ALLOWED_LICENSES = [
  'MIT',
  'ISC',
  'BSD-2-Clause',
  'BSD-3-Clause',
  'Apache-2.0',
  'Zlib',
  '0BSD',
  'CC0-1.0',
] as const;

/** Module names: lowercase letters, digits and dashes, starting with a letter. */
export const MODULE_NAME = /^[a-z][a-z0-9-]*$/;

/**
 * The `blacklight` field of a module's `package.json`.
 *
 * @example
 * ```json
 * "blacklight": {
 *   "module": "sqlite",
 *   "engine": "^1.0.0",
 *   "platforms": ["web", "desktop", "android", "ios"],
 *   "permissions": ["storage", "native"]
 * }
 * ```
 */
export interface ModuleManifest {
  /** Module name: the key in `game.config.ts` `modules` and in `game.modules`. */
  module: string;
  /** Semver range of `@blacklight/core` versions the module works with. */
  engine: string;
  /** Platforms the module runs on; `blacklight add` warns when the game targets others. */
  platforms: ModulePlatform[];
  /** What the module may do (network, storage, native code…), shown before it is installed. */
  permissions: ModulePermission[];
  /** Other modules this one needs; `blacklight add` installs them too. */
  dependencies?: string[];
}

/** The fields of a `package.json` the registry reads. */
export interface PackageJson {
  /** npm package name. */
  name?: string;
  /** Package version (semver). */
  version?: string;
  /** One-line description, shown by `blacklight search`. */
  description?: string;
  /** SPDX license expression; it must be MIT-compatible (see {@link isLicenseAllowed}). */
  license?: string;
  /** Search keywords. */
  keywords?: string[];
  /** Project homepage URL. */
  homepage?: string;
  /** Source repository, as a URL or npm's `{ type, url }` object. */
  repository?:
    | string
    | {
        /** Version control system, usually `git`. */
        type?: string;
        /** Repository URL. */
        url?: string;
      };
  /** A private package cannot be listed in the registry. */
  private?: boolean;
  /** The module manifest ({@link ModuleManifest}), checked by {@link validatePackage}. */
  blacklight?: unknown;
  [key: string]: unknown;
}

const MANIFEST_KEYS = ['module', 'engine', 'platforms', 'permissions', 'dependencies'];

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/** Edit distance, for "did you mean" hints. */
function distance(a: string, b: string): number {
  const row = Array.from({ length: b.length + 1 }, (_, j) => j);
  for (let i = 1; i <= a.length; i++) {
    let previous = row[0]!;
    row[0] = i;
    for (let j = 1; j <= b.length; j++) {
      const current = row[j]!;
      row[j] = Math.min(row[j]! + 1, row[j - 1]! + 1, previous + (a[i - 1] === b[j - 1] ? 0 : 1));
      previous = current;
    }
  }
  return row[b.length]!;
}

/**
 * Names among `candidates` close to `name` (typos, substrings), best first.
 *
 * @example
 * ```ts
 * suggestNames('sqlit', ['sqlite', 'http']); // ['sqlite']
 * ```
 */
export function suggestNames(name: string, candidates: Iterable<string>, max = 3): string[] {
  const target = name.toLowerCase();
  const limit = Math.max(1, Math.floor(target.length / 3));
  return [...candidates]
    .map((candidate) => ({ candidate, score: distance(target, candidate.toLowerCase()) }))
    .filter(({ candidate, score }) => score <= limit || candidate.includes(target))
    .sort((a, b) => a.score - b.score)
    .slice(0, max)
    .map(({ candidate }) => candidate);
}

function hint(name: string, candidates: readonly string[]): string {
  const close = suggestNames(name, candidates, 1);
  return close.length > 0 ? ` Did you mean "${close[0]}"?` : '';
}

/**
 * Module name a package name carries: `blacklight-module-<name>`, `@scope/blacklight-module-<name>`
 * or the official `@blacklight/module-<name>`; `undefined` for other names.
 *
 * @example
 * ```ts
 * moduleNameOf('@blacklight/module-sqlite'); // 'sqlite'
 * moduleNameOf('blacklight-module-chat'); // 'chat'
 * moduleNameOf('lodash'); // undefined
 * ```
 */
export function moduleNameOf(packageName: string): string | undefined {
  const match =
    /^@blacklight\/module-([a-z][a-z0-9-]*)$/.exec(packageName) ??
    /^(?:@[a-z0-9][a-z0-9._-]*\/)?blacklight-module-([a-z][a-z0-9-]*)$/.exec(packageName);
  return match?.[1];
}

/**
 * `true` when an SPDX license expression is MIT-compatible: every part of an `AND` and at least
 * one side of an `OR` is in {@link ALLOWED_LICENSES}.
 *
 * @example
 * ```ts
 * isLicenseAllowed('(MIT OR GPL-3.0)'); // true
 * isLicenseAllowed('GPL-3.0'); // false
 * ```
 */
export function isLicenseAllowed(expression: string): boolean {
  const clean = expression.replace(/[()]/g, ' ').trim();
  if (!clean) return false;
  return clean
    .split(/\s+OR\s+/)
    .some((alternative) =>
      alternative
        .split(/\s+AND\s+/)
        .every((id) => (ALLOWED_LICENSES as readonly string[]).includes(id.trim())),
    );
}

function checkList<T extends string>(
  value: unknown,
  field: string,
  known: readonly T[],
  issues: string[],
  { required }: { required: boolean },
): void {
  if (value === undefined && !required) return;
  if (!Array.isArray(value) || (required && value.length === 0)) {
    issues.push(
      `\`blacklight.${field}\` must be a ${required ? 'non-empty ' : ''}list of: ${known.join(', ')}`,
    );
    return;
  }
  const seen = new Set<string>();
  for (const item of value) {
    if (typeof item !== 'string' || !(known as readonly string[]).includes(item)) {
      issues.push(
        `\`blacklight.${field}\` contains ${JSON.stringify(item)}, which is not one of: ${known.join(', ')}.${typeof item === 'string' ? hint(item, known) : ''}`,
      );
    } else if (seen.has(item)) {
      issues.push(`\`blacklight.${field}\` lists "${item}" twice; remove the duplicate`);
    }
    if (typeof item === 'string') seen.add(item);
  }
}

/**
 * Checks the `blacklight` field of a module's `package.json`. Returns one readable line per
 * problem; an empty list means the manifest is valid.
 *
 * @example
 * ```ts
 * validateManifest({ module: 'chat', engine: '^1.0.0', platforms: ['web'], permissions: [] }); // []
 * ```
 */
export function validateManifest(manifest: unknown): string[] {
  const issues: string[] = [];
  if (!isRecord(manifest)) {
    return [
      'package.json has no `blacklight` manifest: add `"blacklight": { "module": "<name>", "engine": "^1.0.0", "platforms": ["web", "desktop", "android", "ios"], "permissions": [] }`',
    ];
  }
  const { module, engine, platforms, permissions, dependencies } = manifest;
  if (typeof module !== 'string' || !MODULE_NAME.test(module)) {
    issues.push(
      '`blacklight.module` must be the module name: lowercase letters, digits and dashes, starting with a letter (e.g. "high-scores")',
    );
  }
  if (typeof engine !== 'string' || semver.validRange(engine) === null) {
    issues.push(
      '`blacklight.engine` must be a semver range of compatible @blacklight/core versions, e.g. "^1.0.0"',
    );
  }
  checkList(platforms, 'platforms', PLATFORMS, issues, { required: true });
  checkList(permissions, 'permissions', PERMISSIONS, issues, { required: false });
  if (permissions === undefined) {
    issues.push(
      `\`blacklight.permissions\` is required (use [] when the module needs none); known permissions: ${PERMISSIONS.join(', ')}`,
    );
  }
  if (dependencies !== undefined) {
    if (!Array.isArray(dependencies)) {
      issues.push('`blacklight.dependencies` must be a list of module names, e.g. ["http"]');
    } else {
      for (const dependency of dependencies) {
        if (typeof dependency !== 'string' || !MODULE_NAME.test(dependency)) {
          issues.push(
            `\`blacklight.dependencies\` contains ${JSON.stringify(dependency)}, which is not a module name`,
          );
        } else if (dependency === module) {
          issues.push('`blacklight.dependencies` must not list the module itself');
        }
      }
    }
  }
  for (const key of Object.keys(manifest)) {
    if (!MANIFEST_KEYS.includes(key)) {
      issues.push(
        `\`blacklight.${key}\` is not a manifest field.${hint(key, MANIFEST_KEYS)} Known fields: ${MANIFEST_KEYS.join(', ')}.`,
      );
    }
  }
  return issues;
}

/**
 * Checks a module package's `package.json`: name pattern, version, description, license and the
 * `blacklight` manifest. Returns one readable line per problem.
 *
 * @example
 * ```ts
 * const issues = validatePackage(JSON.parse(readFileSync('package.json', 'utf8')));
 * if (issues.length > 0) console.error(issues.join('\n'));
 * ```
 */
export function validatePackage(pkg: unknown): string[] {
  if (!isRecord(pkg)) return ['package.json must contain a JSON object'];
  const issues: string[] = [];
  const name = typeof pkg.name === 'string' ? pkg.name : '';
  const fromName = moduleNameOf(name);
  if (!fromName) {
    issues.push(
      `the package name ${JSON.stringify(pkg.name ?? '')} must be \`blacklight-module-<name>\` or \`@scope/blacklight-module-<name>\` (lowercase, e.g. "blacklight-module-chat")`,
    );
  }
  if (typeof pkg.version !== 'string' || semver.valid(pkg.version) === null) {
    issues.push('`version` must be a semver version, e.g. "1.0.0"');
  }
  if (typeof pkg.description !== 'string' || pkg.description.trim() === '') {
    issues.push('`description` is required: one sentence shown by `blacklight search`');
  }
  if (typeof pkg.license !== 'string' || !isLicenseAllowed(pkg.license)) {
    issues.push(
      `\`license\` must be MIT-compatible (${ALLOWED_LICENSES.join(', ')}), got ${JSON.stringify(pkg.license ?? null)}`,
    );
  }
  if (pkg.private === true) {
    issues.push('`private: true` prevents publishing; remove it');
  }
  issues.push(...validateManifest(pkg.blacklight));
  const manifestName = isRecord(pkg.blacklight) ? pkg.blacklight.module : undefined;
  if (fromName && typeof manifestName === 'string' && manifestName !== fromName) {
    issues.push(
      `\`blacklight.module\` is "${manifestName}" but the package name says "${fromName}"; make them equal`,
    );
  }
  return issues;
}
