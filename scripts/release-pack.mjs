// Packs every published package of the workspace for a GitHub release (DOC-07): one `.tgz` per
// package, all at the same version, whose engine dependencies point at the tarballs of the same
// release, plus `create-blacklight.tgz` (the scaffolder again, under a name that
// `releases/latest/download/` can point at). A game installs them with plain `pnpm install`: `@blacklight/*` come from the release
// assets, third-party packages from npm.
//
// - `dependencies` and `optionalDependencies` on `workspace:` (the CLI's create-blacklight,
//   registry and mobile) become peer dependencies on the asset URL `<base>/<file>.tgz`. pnpm
//   refuses URL dependencies below the top level (`blockExoticSubdeps`, on by default), but
//   installs a missing peer from its URL like a direct dependency of the game
//   (`autoInstallPeers`, on by default), so the transitive engine packages come from the release.
// - `peerDependencies` on `workspace:` become `^<version>`: the game lists those packages itself
//   (core, ui…) and pnpm checks the version it installed from the URL.
// - `devDependencies` on `workspace:` are dropped; they are never installed by a game.
//
// Run after `pnpm build`:
//   node scripts/release-pack.mjs --version 1.2.0 --out release
//   node scripts/release-pack.mjs --version 1.2.0 --out release --base-url http://127.0.0.1:4873
import { execFileSync } from 'node:child_process';
import {
  cpSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  renameSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { parseArgs } from 'node:util';
import { pathToFileURL } from 'node:url';

const root = join(import.meta.dirname, '..');

/** GitHub repository the releases are attached to. */
export const REPOSITORY = 'beedywool/blacklight-engine';

/**
 * Folder URL of a release's assets.
 * @param {string} version Version without the `v`.
 */
export function releaseBase(version) {
  return `https://github.com/${REPOSITORY}/releases/download/v${version}`;
}

/**
 * Asset file name of a package, as `pnpm pack` names it: `@blacklight/core` → `blacklight-core-1.2.0.tgz`.
 * @param {string} name
 * @param {string} version
 */
export function assetName(name, version) {
  return `${name.replace(/^@/, '').replace('/', '-')}-${version}.tgz`;
}

/**
 * Folders of the packages a release publishes: every non-private package under `packages/`,
 * `packages/modules/` and `servers/` (the relay; the reference server is private).
 */
export function publishedPackages(base = root) {
  const dirs = [];
  for (const parent of ['packages', join('packages', 'modules'), 'servers']) {
    for (const name of readdirSync(join(base, parent)).sort()) {
      const dir = join(base, parent, name);
      const file = join(dir, 'package.json');
      if (!existsSync(file)) continue;
      const manifest = JSON.parse(readFileSync(file, 'utf8'));
      if (!manifest.private) dirs.push(dir);
    }
  }
  return dirs;
}

/** Name of the copy of create-blacklight without a version, for `releases/latest/download/`. */
export const LATEST_CREATE = 'create-blacklight.tgz';

/**
 * The `package.json` of a package as published in a release.
 * @param {Record<string, any>} manifest Workspace manifest (not modified).
 * @param {{ version: string, baseUrl: string }} release
 */
export function releaseManifest(manifest, { version, baseUrl }) {
  const out = structuredClone(manifest);
  out.version = version;
  const base = baseUrl.replace(/\/+$/, '');
  for (const field of ['dependencies', 'optionalDependencies']) {
    for (const [name, range] of Object.entries(out[field] ?? {})) {
      if (!range.startsWith('workspace:')) continue;
      delete out[field][name];
      out.peerDependencies = {
        ...out.peerDependencies,
        [name]: `${base}/${assetName(name, version)}`,
      };
    }
  }
  for (const [name, range] of Object.entries(out.peerDependencies ?? {})) {
    if (range.startsWith('workspace:')) out.peerDependencies[name] = `^${version}`;
  }
  for (const [name, range] of Object.entries(out.devDependencies ?? {})) {
    if (range.startsWith('workspace:')) delete out.devDependencies[name];
  }
  return out;
}

/**
 * Packs every published package into `out`. Returns the written file paths.
 * @param {{ version: string, out: string, baseUrl?: string, log?: (line: string) => void }} options
 */
export function packRelease({ version, out, baseUrl = releaseBase(version), log = () => {} }) {
  mkdirSync(out, { recursive: true });
  const stage = mkdtempSync(join(tmpdir(), 'blacklight-release-'));
  const written = [];
  try {
    for (const dir of publishedPackages()) {
      const manifest = JSON.parse(readFileSync(join(dir, 'package.json'), 'utf8'));
      // `pnpm build` builds packages/; the relay in servers/ is built here when it is missing.
      if (!existsSync(join(dir, 'dist'))) {
        log(`${manifest.name} has no dist/: building it`);
        execFileSync('pnpm', ['--filter', manifest.name, 'build'], {
          cwd: root,
          stdio: 'inherit',
          shell: process.platform === 'win32',
        });
      }
      // A copy outside the workspace: pnpm packs it as a standalone package with our manifest.
      const copy = join(stage, assetName(manifest.name, version).replace(/\.tgz$/, ''));
      cpSync(dir, copy, {
        recursive: true,
        filter: (src) => !/[\\/]node_modules([\\/]|$)/.test(src.slice(dir.length)),
      });
      writeFileSync(
        join(copy, 'package.json'),
        `${JSON.stringify(releaseManifest(manifest, { version, baseUrl }), null, 2)}\n`,
      );
      const before = new Set(readdirSync(copy));
      execFileSync('pnpm', ['pack', '--pack-destination', copy], {
        cwd: copy,
        stdio: 'ignore',
        shell: process.platform === 'win32',
      });
      const packed = readdirSync(copy).find((f) => f.endsWith('.tgz') && !before.has(f));
      if (!packed) throw new Error(`pnpm pack wrote no tarball for ${manifest.name}.`);
      const target = join(out, assetName(manifest.name, version));
      renameSync(join(copy, packed), target);
      written.push(target);
      log(`${manifest.name} → ${target}`);
      // The documented create command uses GitHub's `releases/latest/download/<name>`, which
      // needs a name that stays the same from one release to the next.
      if (manifest.name === 'create-blacklight') {
        cpSync(target, join(out, LATEST_CREATE));
        written.push(join(out, LATEST_CREATE));
      }
    }
  } finally {
    rmSync(stage, { recursive: true, force: true });
  }
  return written;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const { values } = parseArgs({
    options: {
      version: { type: 'string' },
      out: { type: 'string', default: 'release' },
      'base-url': { type: 'string' },
    },
  });
  const version = values.version?.replace(/^v/, '');
  if (!version || !/^\d+\.\d+\.\d+(-[0-9A-Za-z.-]+)?$/.test(version)) {
    console.error('release-pack: pass --version <x.y.z> (the tag without its v).');
    process.exit(1);
  }
  const files = packRelease({
    version,
    out: resolve(values.out),
    baseUrl: values['base-url'],
    log: (line) => console.log(line),
  });
  console.log(`Packed ${files.length} packages for ${version}.`);
}
