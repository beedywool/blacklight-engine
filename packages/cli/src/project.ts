import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { createRequire } from 'node:module';
import { join, relative, sep } from 'node:path';
import { pathToFileURL } from 'node:url';
import { runnerImport } from 'vite';

/** Folders that hold game files. */
export const PROJECT_DIRS = [
  'assets',
  'scenes',
  'objects',
  'models',
  'stories',
  'ui',
  'animations',
  'locales',
];

/** Extensions served as assets (loaded at runtime by URL). */
export const ASSET_EXTENSIONS = new Set([
  'png',
  'jpg',
  'jpeg',
  'webp',
  'avif',
  'gif',
  'svg',
  'ogg',
  'm4a',
  'mp3',
  'wav',
  'opus',
  'aac',
  'flac',
  'woff2',
  'woff',
  'ttf',
  'otf',
  'fnt',
  'mp4',
  'webm',
  'mov',
  'json',
  'txt',
  'vtt',
  'srt',
  'csv',
  'glb',
  'gltf',
  'bin',
  'ktx2',
  'drc',
]);

/** JSON files imported as modules rather than fetched. */
const MODULE_JSON = /\.(anim|tilemap|layout|timeline)\.json$/;

function walk(dir: string, out: string[]): void {
  if (!existsSync(dir)) return;
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (entry.name.startsWith('.') || entry.name === 'node_modules') continue;
    const path = join(dir, entry.name);
    if (entry.isDirectory()) walk(path, out);
    else out.push(path);
  }
}

function extension(file: string): string {
  const dot = file.lastIndexOf('.');
  return dot < 0 ? '' : file.slice(dot + 1).toLowerCase();
}

/** Project-relative asset paths (forward slashes), sorted. */
export function scanAssets(root: string): string[] {
  const files: string[] = [];
  for (const dir of PROJECT_DIRS) walk(join(root, dir), files);
  return files
    .map((file) => relative(root, file).split(sep).join('/'))
    .filter((file) => ASSET_EXTENSIONS.has(extension(file)) && !MODULE_JSON.test(file))
    .sort();
}

/** Scene folders that have a `<name>.scene.ts`. */
export function scanScenes(root: string): string[] {
  const dir = join(root, 'scenes');
  if (!existsSync(dir)) return [];
  return readdirSync(dir)
    .filter((name) =>
      ['ts', 'js'].some((ext) => existsSync(join(dir, name, `${name}.scene.${ext}`))),
    )
    .sort();
}

function pascal(folder: string): string {
  return folder
    .split(/[-_\s]+/)
    .filter(Boolean)
    .map((p) => p[0]!.toUpperCase() + p.slice(1))
    .join('');
}

/** Registered object names (global and scene-local). */
export function scanObjects(root: string): string[] {
  const names = new Set<string>();
  const collect = (dir: string) => {
    if (!existsSync(dir)) return;
    for (const name of readdirSync(dir)) {
      if (['ts', 'js'].some((ext) => existsSync(join(dir, name, `${name}.object.${ext}`))))
        names.add(pascal(name));
    }
  };
  collect(join(root, 'objects'));
  for (const scene of scanScenes(root)) collect(join(root, 'scenes', scene, 'objects'));
  return [...names].sort();
}

/** Animation names from `.anim.json` files and Aseprite tags. */
export function scanAnimations(root: string): string[] {
  const names = new Set<string>();
  const files: string[] = [];
  for (const dir of ['objects', 'scenes']) walk(join(root, dir), files);
  for (const file of files) {
    if (!file.endsWith('.json')) continue;
    try {
      const json = JSON.parse(readFileSync(file, 'utf8')) as {
        animations?: Record<string, unknown>;
        meta?: { frameTags?: { name: string }[] };
      };
      if (file.endsWith('.anim.json'))
        for (const name of Object.keys(json.animations ?? {})) names.add(name);
      for (const tag of json.meta?.frameTags ?? []) names.add(tag.name);
    } catch {
      // Not JSON we understand: ignore.
    }
  }
  return [...names].sort();
}

function configFile(root: string): string | undefined {
  return ['game.config.ts', 'game.config.js'].map((f) => join(root, f)).find(existsSync);
}

/**
 * Loads and validates `game.config.ts` with the game's own `@blacklight/core`.
 *
 * @throws Error listing every invalid field.
 */
export async function loadGameConfig(
  root: string,
): Promise<{ input?: { actions?: Record<string, string[]> } } & Record<string, unknown>> {
  const file = configFile(root);
  if (!file) throw new Error(`No game.config.ts in ${root}.`);
  const { module } = await runnerImport<{ default: unknown }>(file, {
    root,
    logLevel: 'silent',
    configFile: false,
  });
  const require = createRequire(join(root, 'package.json'));
  const core = (await import(pathToFileURL(require.resolve('@blacklight/core/config')).href)) as {
    resolveConfig: (input: unknown) => Record<string, unknown>;
    DEFAULT_ACTIONS: Record<string, string[]>;
  };
  const config = core.resolveConfig(module.default) as {
    input?: { actions?: Record<string, string[]> };
  } & Record<string, unknown>;
  return {
    ...config,
    input: { ...config.input, actions: { ...core.DEFAULT_ACTIONS, ...config.input?.actions } },
  };
}

const union = (values: string[]) =>
  values.length > 0 ? values.map((v) => JSON.stringify(v)).join(' | ') : 'never';

/** Content of `.blacklight/types.d.ts`: the game's names for {@link Register}. */
export function typesFile(root: string, actions: string[]): string {
  const assets = scanAssets(root);
  const keys = new Set<string>();
  for (const path of assets) {
    keys.add(path);
    const file = path.slice(path.lastIndexOf('/') + 1);
    keys.add(file.slice(0, file.indexOf('.') < 0 ? undefined : file.indexOf('.')));
  }
  return `// Generated by the blacklight CLI from the project's files. Do not edit.
import '@blacklight/core';

declare module '@blacklight/core' {
  interface Register {
    scenes: ${union(scanScenes(root))};
    objects: ${union(scanObjects(root))};
    actions: ${union([...new Set(actions)].sort())};
    animations: ${union(scanAnimations(root))};
    assets: ${union([...keys].sort())};
  }
}
`;
}

export function isDirectory(path: string): boolean {
  return existsSync(path) && statSync(path).isDirectory();
}
