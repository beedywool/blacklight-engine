import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { dirname, join, relative, sep } from 'node:path';
import { DEFAULT_ACTIONS } from './engine';

/** Same folders and extensions as the CLI's asset scan (`packages/cli/src/project.ts`). */
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
export const ASSET_EXTENSIONS = new Set(
  'png jpg jpeg webp avif gif svg ogg m4a mp3 wav opus aac flac woff2 woff ttf otf fnt mp4 webm mov json txt ink csv glb gltf bin ktx2 drc'.split(
    ' ',
  ),
);
export const IMAGE_EXTENSIONS = new Set(['png', 'jpg', 'jpeg', 'webp', 'avif', 'gif', 'svg']);
/** JSON imported as modules, not served as assets. */
export const MODULE_JSON = /\.(anim|tilemap|layout|timeline)\.json$/;
export const CONFIG_FILES = ['game.config.ts', 'game.config.js'];

/** Project-relative path with forward slashes. */
export const rel = (root: string, file: string) => relative(root, file).split(sep).join('/');

export function extension(file: string): string {
  const dot = file.lastIndexOf('.');
  return dot < 0 ? '' : file.slice(dot + 1).toLowerCase();
}

/** `big-enemy` → `BigEnemy`, like the runtime registry. */
export function pascalCase(folder: string): string {
  return folder
    .split(/[-_\s]+/)
    .filter(Boolean)
    .map((part) => part[0]!.toUpperCase() + part.slice(1))
    .join('');
}

/** The game folder (with `game.config.ts`) that contains `path`, if any. */
export function findGameRoot(path: string): string | undefined {
  let dir = existsSync(path) && statSync(path).isDirectory() ? path : dirname(path);
  for (;;) {
    if (CONFIG_FILES.some((f) => existsSync(join(dir, f)))) return dir;
    const parent = dirname(dir);
    if (parent === dir) return undefined;
    dir = parent;
  }
}

export function walk(dir: string, out: string[] = []): string[] {
  if (!existsSync(dir)) return out;
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (entry.name.startsWith('.') || entry.name === 'node_modules') continue;
    const path = join(dir, entry.name);
    if (entry.isDirectory()) walk(path, out);
    else out.push(path);
  }
  return out;
}

/** Scene names (folders with `<name>.scene.ts`). */
export function listScenes(root: string): string[] {
  const dir = join(root, 'scenes');
  if (!existsSync(dir)) return [];
  return readdirSync(dir)
    .filter((name) =>
      ['ts', 'js'].some((ext) => existsSync(join(dir, name, `${name}.scene.${ext}`))),
    )
    .sort();
}

/** One object class found in the project. */
export interface ObjectInfo {
  /** Registry name (`BigEnemy`). */
  name: string;
  /** Project folder (`objects/big-enemy`). */
  folder: string;
  /** Owning scene for scene-local objects. */
  scene?: string;
  /** Source file, project-relative. */
  file: string;
  /** `.anim.json`, when the object has one. */
  anim?: string;
  /** First image of the folder (thumbnail), project-relative. */
  image?: string;
}

function objectsIn(root: string, dir: string, scene?: string): ObjectInfo[] {
  const abs = join(root, dir);
  if (!existsSync(abs)) return [];
  const out: ObjectInfo[] = [];
  for (const folder of readdirSync(abs).sort()) {
    const ext = ['ts', 'js'].find((e) => existsSync(join(abs, folder, `${folder}.object.${e}`)));
    if (!ext) continue;
    const files = readdirSync(join(abs, folder));
    const anim = files.find((f) => f === `${folder}.anim.json`);
    const image =
      files.find((f) => f.startsWith(folder) && IMAGE_EXTENSIONS.has(extension(f))) ??
      files.find((f) => IMAGE_EXTENSIONS.has(extension(f)));
    out.push({
      name: pascalCase(folder),
      folder: `${dir}/${folder}`,
      ...(scene && { scene }),
      file: `${dir}/${folder}/${folder}.object.${ext}`,
      ...(anim && { anim: `${dir}/${folder}/${anim}` }),
      ...(image && { image: `${dir}/${folder}/${image}` }),
    });
  }
  return out;
}

/** Global objects, then each scene's own objects. */
export function listObjects(root: string): ObjectInfo[] {
  return [
    ...objectsIn(root, 'objects'),
    ...listScenes(root).flatMap((scene) => objectsIn(root, `scenes/${scene}/objects`, scene)),
  ];
}

/** Objects a scene can spawn: its own, then global ones it does not shadow. */
export function objectsForScene(root: string, scene: string): ObjectInfo[] {
  const all = listObjects(root);
  const local = all.filter((o) => o.scene === scene);
  const names = new Set(local.map((o) => o.name));
  return [...local, ...all.filter((o) => !o.scene && !names.has(o.name))];
}

/** Every asset file, project-relative, sorted (the runtime manifest's keys). */
export function listAssets(root: string): string[] {
  return PROJECT_DIRS.flatMap((dir) => walk(join(root, dir)))
    .map((file) => rel(root, file))
    .filter((file) => ASSET_EXTENSIONS.has(extension(file)) && !MODULE_JSON.test(file))
    .sort();
}

/** Short key of an asset (`assets/sfx/coin.wav` → `coin`), as `audio.play('coin')` takes. */
export function assetKey(path: string): string {
  const file = path.slice(path.lastIndexOf('/') + 1);
  const dot = file.indexOf('.');
  return dot < 0 ? file : file.slice(0, dot);
}

/** Animation names of an `.anim.json` file (empty when unreadable). */
export function animationNames(file: string): string[] {
  try {
    const json = JSON.parse(readFileSync(file, 'utf8')) as { animations?: Record<string, unknown> };
    return Object.keys(json.animations ?? {});
  } catch {
    return [];
  }
}

/** The object folder a source file belongs to, if any. */
export function objectOfFile(root: string, file: string): ObjectInfo | undefined {
  const path = rel(root, file);
  return listObjects(root).find((o) => path.startsWith(`${o.folder}/`));
}

/** The scene folder a source file belongs to, if any. */
export function sceneOfFile(root: string, file: string): string | undefined {
  return /^scenes\/([^/]+)\//.exec(rel(root, file))?.[1];
}

/**
 * Input action names: from `.blacklight/types.d.ts` when the CLI wrote it, else the engine
 * defaults plus the keys of `input.actions` in `game.config.ts`.
 */
export function readActions(root: string): string[] {
  const types = join(root, '.blacklight', 'types.d.ts');
  if (existsSync(types)) {
    const line = /actions:\s*([^;]+);/.exec(readFileSync(types, 'utf8'))?.[1];
    if (line && line.trim() !== 'never') return [...line.matchAll(/"([^"]+)"/g)].map((m) => m[1]!);
  }
  const names = new Set(Object.keys(DEFAULT_ACTIONS));
  const config = CONFIG_FILES.map((f) => join(root, f)).find(existsSync);
  if (config) {
    const text = readFileSync(config, 'utf8');
    const block = /actions\s*:\s*\{/.exec(text);
    if (block) for (const key of topLevelKeys(text, block.index + block[0].length)) names.add(key);
  }
  return [...names].sort();
}

/** Keys of an object literal starting after its `{` at `start`, ignoring nested values. */
export function topLevelKeys(text: string, start: number): string[] {
  let depth = 0;
  let flat = '';
  for (let i = start; i < text.length; i++) {
    const c = text[i]!;
    if ('{[('.includes(c)) depth++;
    else if ('}])'.includes(c)) {
      if (depth === 0) break;
      depth--;
    } else if (depth === 0) flat += c;
  }
  return [...flat.matchAll(/([A-Za-z_$][\w$]*|'[^']+'|"[^"]+")\s*:/g)].map((m) =>
    m[1]!.replace(/^['"]|['"]$/g, ''),
  );
}
