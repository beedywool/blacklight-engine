import { Box3, LoadingManager, Mesh, Sphere, type AnimationClip, type Group } from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import type { DRACOLoader } from 'three/examples/jsm/loaders/DRACOLoader.js';
import type { KTX2Loader } from 'three/examples/jsm/loaders/KTX2Loader.js';
import { AssetStore, resolveProjectPath } from '@blacklight/core';

/** A glTF / GLB file ready to be shown by any number of `Model3D` objects. */
export interface LoadedModel {
  /** Project path of the file. */
  path: string;
  /** The loaded scene. Models show clones of it; do not add it to a view yourself. */
  scene: Group;
  /** Animation clips by name, in file order. */
  animations: AnimationClip[];
  /** Bounds of the model at rest, in model units. */
  box: Box3;
  /** Bounding sphere of the model at rest, in model units: fits the model whatever its turn. */
  sphere: Sphere;
  /** Triangles drawn per instance. */
  triangles: number;
}

/** File extensions this package loads. */
export const MODEL_EXTENSIONS = ['glb', 'gltf'];

let draco: Promise<DRACOLoader> | undefined;
let ktx2: Promise<KTX2Loader> | undefined;

/**
 * Draco geometry decoder, loaded the first time a file needs it. three's loader references its
 * decoder files with `new URL(…, import.meta.url)`, so the game build ships them next to the code
 * and they load offline, never from a CDN (3D-06).
 */
function dracoLoader(): Promise<DRACOLoader> {
  draco ??= import('three/examples/jsm/loaders/DRACOLoader.js').then(
    ({ DRACOLoader }) => new DRACOLoader(),
  );
  return draco;
}

/** KTX2 / Basis texture transcoder, loaded the first time a file needs it (bundled like Draco's). */
function ktx2Loader(): Promise<KTX2Loader> {
  ktx2 ??= import('three/examples/jsm/loaders/KTX2Loader.js').then(({ KTX2Loader }) => {
    const loader = new KTX2Loader();
    detectCompressedFormats(loader);
    return loader;
  });
  return ktx2;
}

/**
 * KTX2 textures are transcoded to a format the GPU supports, which the loader reads from a
 * renderer. Files load before the first model draws, so a short-lived context answers instead;
 * the answer only depends on the GPU and browser, not on the context.
 */
function detectCompressedFormats(loader: KTX2Loader): void {
  const canvas = document.createElement('canvas');
  const gl = canvas.getContext('webgl2');
  if (!gl) {
    throw new Error(
      'Loading KTX2 textures needs WebGL 2, which this browser does not offer. Use PNG or JPEG textures for this model.',
    );
  }
  const extensions = new Set(gl.getSupportedExtensions() ?? []);
  loader.detectSupport({
    extensions: {
      has: (name: string) => extensions.has(name),
      get: (name: string) => gl.getExtension(name),
    },
  } as never);
  gl.getExtension('WEBGL_lose_context')?.loseContext();
}

interface GltfHeader {
  extensionsUsed?: string[];
  buffers?: { uri?: string }[];
  images?: { uri?: string }[];
}

/** The JSON part of a .gltf or .glb file, `{}` when it cannot be read. */
function header(data: ArrayBuffer): GltfHeader {
  const bytes = new Uint8Array(data);
  let json: string;
  // GLB: "glTF" magic, then the JSON chunk (length at byte 12, content from byte 20).
  if (bytes[0] === 0x67 && bytes[1] === 0x6c && bytes[2] === 0x54 && bytes[3] === 0x46) {
    const length = new DataView(data).getUint32(12, true);
    json = new TextDecoder().decode(bytes.subarray(20, 20 + length));
  } else {
    json = new TextDecoder().decode(bytes);
  }
  try {
    return JSON.parse(json) as GltfHeader;
  } catch {
    return {};
  }
}

/**
 * Extensions a glTF file declares (`KHR_draco_mesh_compression`, `KHR_texture_basisu`…), read
 * from its header without parsing the rest: to check a file before shipping it.
 *
 * @param data - A `.glb` or `.gltf` file.
 *
 * @example
 * ```ts
 * import { extensionsUsed } from '@blacklight/three';
 *
 * const data = await (await fetch('/models/hero.glb')).arrayBuffer();
 * extensionsUsed(data); // ['KHR_draco_mesh_compression']
 * ```
 */
export function extensionsUsed(data: ArrayBuffer): string[] {
  return header(data).extensionsUsed ?? [];
}

const INLINE = /^(data|blob|https?):/;

/**
 * Parses a glTF / GLB file. Files a `.gltf` references (`.bin`, textures) are looked up in the
 * game's asset manifest, so they keep working after the build renames them. Use it for model
 * bytes that do not come from the asset store (a download, a file picked by the player).
 *
 * @param data - The `.glb` or `.gltf` file.
 * @param path - Project path of the file, for error messages and to resolve relative references.
 * @throws Error when the file is not valid glTF.
 *
 * @example
 * ```ts
 * import { parseModel } from '@blacklight/three';
 *
 * const model = await parseModel(await file.arrayBuffer(), 'models/custom.glb');
 * model.animations.map((clip) => clip.name); // ['idle', 'run']
 * ```
 */
export async function parseModel(
  data: ArrayBuffer,
  path: string,
  assets?: AssetStore,
): Promise<LoadedModel> {
  const dir = path.slice(0, path.lastIndexOf('/'));
  const fileOf = (uri: string) => resolveProjectPath(decodeURI(uri), dir);
  const json = header(data);
  for (const { uri } of [...(json.buffers ?? []), ...(json.images ?? [])]) {
    if (!uri || INLINE.test(uri) || assets?.url(fileOf(uri))) continue;
    throw new Error(
      `${path} references "${uri}", which is not in the project (looked for ${fileOf(uri)}). Keep the files a .gltf uses next to it, or export a single .glb.`,
    );
  }
  const manager = new LoadingManager();
  manager.setURLModifier((uri) => (INLINE.test(uri) ? uri : (assets?.url(fileOf(uri)) ?? uri)));
  const loader = new GLTFLoader(manager);
  const used = json.extensionsUsed ?? [];
  if (used.includes('KHR_draco_mesh_compression')) loader.setDRACOLoader(await dracoLoader());
  if (used.includes('KHR_texture_basisu')) loader.setKTX2Loader(await ktx2Loader());
  const gltf = await loader.parseAsync(data, '');
  const box = new Box3().setFromObject(gltf.scene);
  let triangles = 0;
  gltf.scene.traverse((node) => {
    if (!(node instanceof Mesh)) return;
    const geometry = node.geometry;
    triangles += (geometry.index?.count ?? geometry.getAttribute('position').count) / 3;
  });
  return {
    path,
    scene: gltf.scene,
    animations: gltf.animations,
    box,
    sphere: box.getBoundingSphere(new Sphere()),
    triangles,
  };
}

/**
 * Fetches and parses a model; the asset loader registered for `.glb` and `.gltf`. Games load
 * models through the asset store (`static assets`, `scene.assets.load`), which calls it.
 *
 * @throws Error when the request fails (with its HTTP status) or the file is not valid glTF.
 *
 * @example
 * ```ts
 * import { loadModel } from '@blacklight/three';
 *
 * const model = await loadModel('models/hero.glb', '/assets/hero-3f2a.glb');
 * ```
 */
export async function loadModel(
  path: string,
  url: string,
  assets?: AssetStore,
): Promise<LoadedModel> {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`Could not load ${path} (${url}): HTTP ${response.status}.`);
  return parseModel(await response.arrayBuffer(), path, assets);
}

let registered = false;

/**
 * Lets asset stores load `.glb` and `.gltf` files. Runs when the package is imported, so scenes
 * that use 3D preload their models like any other file; call it again only after replacing the
 * store's loaders (tests). Later calls do nothing.
 *
 * @example
 * ```ts
 * import { registerModelLoader } from '@blacklight/three';
 *
 * registerModelLoader();
 * await game.assets.load(['models/hero.glb']);
 * ```
 */
export function registerModelLoader(): void {
  if (registered) return;
  registered = true;
  AssetStore.registerLoader(MODEL_EXTENSIONS, loadModel);
}
