import { readFileSync, statSync } from 'node:fs';
import { join, posix } from 'node:path';
import {
  assetKey,
  extension,
  IMAGE_EXTENSIONS,
  listAssets,
  listObjects,
  listScenes,
  rel,
  walk,
} from './project';

const SOURCE_EXTENSIONS = new Set(['ts', 'js', 'mjs', 'vue', 'json', 'css', 'html', 'ink', 'md']);
const FONT_EXTENSIONS = new Set(['woff2', 'woff', 'ttf', 'otf', 'fnt']);
const AUDIO_EXTENSIONS = new Set(['ogg', 'm4a', 'mp3', 'wav', 'opus', 'aac', 'flac']);

export type AssetKind = 'image' | 'audio' | 'font' | 'video' | 'model' | 'data';

export function assetKind(path: string): AssetKind {
  const ext = extension(path);
  if (IMAGE_EXTENSIONS.has(ext)) return 'image';
  if (AUDIO_EXTENSIONS.has(ext)) return 'audio';
  if (FONT_EXTENSIONS.has(ext)) return 'font';
  if (['mp4', 'webm', 'mov'].includes(ext)) return 'video';
  if (['glb', 'gltf', 'bin', 'ktx2', 'drc'].includes(ext)) return 'model';
  return 'data';
}

/** One asset in the browser. */
export interface AssetEntry {
  path: string;
  bytes: number;
  kind: AssetKind;
  /** Referenced by code or data, or loaded by convention (object sheets, fonts). */
  used: boolean;
  /** Why it counts as used (first reason found). */
  usedBy?: string;
  /** Scenes that preload it. */
  scenes: string[];
}

/** What a scene downloads before it starts. */
export interface SceneWeight {
  scene: string;
  bytes: number;
  files: { path: string; bytes: number; reason: string }[];
}

export interface AssetReport {
  assets: AssetEntry[];
  scenes: SceneWeight[];
  totalBytes: number;
}

/** Project path an asset reference written in code points to (`@assets/x`, `./x`, `/x`). */
export function resolveRef(ref: string, base: string): string {
  const alias = /^@(assets|objects|models|stories|ui|modules)\//.exec(ref);
  if (alias) return posix.normalize(ref.slice(1));
  if (ref.startsWith('/')) return posix.normalize(ref.slice(1));
  return posix.normalize(`${base}/${ref}`);
}

/** Entries of `static assets = [...]` in a source text. */
export function staticAssets(source: string): string[] {
  const list = /static\s+(?:override\s+)?assets\s*(?::[^=]+)?=\s*\[([^\]]*)\]/.exec(source)?.[1];
  return list ? [...list.matchAll(/['"`]([^'"`]+)['"`]/g)].map((m) => m[1]!) : [];
}

function matchRefs(refs: string[], base: string, assets: string[]): string[] {
  const out = new Set<string>();
  for (const ref of refs) {
    const path = resolveRef(ref, base).replace(/\/$/, '');
    if (ref.endsWith('/')) for (const a of assets) if (a.startsWith(`${path}/`)) out.add(a);
    for (const a of assets) if (a === path || a.slice(0, a.lastIndexOf('.')) === path) out.add(a);
  }
  return [...out];
}

/** Every file of the project that can reference an asset, with its text. */
function sources(root: string): { path: string; text: string }[] {
  const files = ['game.config.ts', 'game.config.js', 'index.html'].map((f) => join(root, f));
  for (const dir of [
    'scenes',
    'objects',
    'ui',
    'modules',
    'animations',
    'stories',
    'locales',
    'assets',
  ])
    files.push(...walk(join(root, dir)));
  const out: { path: string; text: string }[] = [];
  for (const file of files) {
    if (!SOURCE_EXTENSIONS.has(extension(file))) continue;
    try {
      out.push({ path: rel(root, file), text: readFileSync(file, 'utf8') });
    } catch {
      // Missing optional file.
    }
  }
  return out;
}

/** Why an asset is used, or `undefined`. */
function usage(
  asset: string,
  files: { path: string; text: string }[],
  objectFolders: string[],
): string | undefined {
  if (FONT_EXTENSIONS.has(extension(asset)) && asset.startsWith('assets/'))
    return 'fonts in assets/ load at start';
  const folder = objectFolders.find((f) => asset.startsWith(`${f}/`));
  const name = posix.basename(asset);
  if (folder) {
    const objectName = posix.basename(folder);
    if (assetKey(asset) === objectName || assetKey(asset).startsWith(`${objectName}@`))
      return `sheet of ${folder}`;
  }
  const key = assetKey(asset);
  const quotedKey = new RegExp(`['"\`]${key.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}['"\`]`);
  for (const file of files) {
    if (file.path === asset) continue;
    if (file.text.includes(name) || file.text.includes(asset)) return file.path;
    if (quotedKey.test(file.text)) return file.path;
  }
  return undefined;
}

/** Sizes, usage and per-scene preload weight of every asset of the game. */
export function assetReport(root: string): AssetReport {
  const paths = listAssets(root);
  const size = new Map(paths.map((p) => [p, statSync(join(root, p)).size]));
  const files = sources(root);
  const objects = listObjects(root);
  const objectFolders = objects.map((o) => o.folder);
  const sceneOf = new Map<string, Set<string>>();
  const scenes: SceneWeight[] = listScenes(root).map((scene) => {
    const chosen = new Map<string, string>();
    for (const a of paths)
      if (a.startsWith(`scenes/${scene}/assets/`)) chosen.set(a, 'scene assets folder');
    const sceneFile = files.find((f) =>
      new RegExp(`^scenes/${scene}/${scene}\\.scene\\.[cm]?[jt]s$`).test(f.path),
    );
    for (const a of matchRefs(staticAssets(sceneFile?.text ?? ''), `scenes/${scene}`, paths))
      if (!chosen.has(a)) chosen.set(a, 'static assets');
    // The runtime loads every global object and the scene's own objects with their files.
    for (const object of objects.filter((o) => !o.scene || o.scene === scene)) {
      for (const a of paths)
        if (a.startsWith(`${object.folder}/`) && !chosen.has(a))
          chosen.set(a, `object ${object.name}`);
      const objectFile = files.find((f) => f.path === object.file);
      for (const a of matchRefs(staticAssets(objectFile?.text ?? ''), object.folder, paths))
        if (!chosen.has(a)) chosen.set(a, `object ${object.name} static assets`);
    }
    for (const a of chosen.keys()) {
      if (!sceneOf.has(a)) sceneOf.set(a, new Set());
      sceneOf.get(a)!.add(scene);
    }
    const list = [...chosen].map(([path, reason]) => ({
      path,
      bytes: size.get(path) ?? 0,
      reason,
    }));
    list.sort((a, b) => b.bytes - a.bytes);
    return { scene, bytes: list.reduce((sum, f) => sum + f.bytes, 0), files: list };
  });
  const assets = paths.map<AssetEntry>((path) => {
    const usedBy = usage(path, files, objectFolders);
    return {
      path,
      bytes: size.get(path) ?? 0,
      kind: assetKind(path),
      used: !!usedBy,
      ...(usedBy && { usedBy }),
      scenes: [...(sceneOf.get(path) ?? [])].sort(),
    };
  });
  return { assets, scenes, totalBytes: assets.reduce((sum, a) => sum + a.bytes, 0) };
}

/** `12.3 KB`. */
export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(2)} MB`;
}
