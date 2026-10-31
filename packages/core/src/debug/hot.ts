// Hot reload of scenes and objects (TL-02). The CLI's Vite plugin makes every `*.scene.ts` and
// `*.object.ts` module accept its own updates and hands the new module to the function installed
// here. Dev only: imported through `@blacklight/core/debug`.
import type { Game } from '../game';
import { GameObject } from '../objects/game-object';
import { stamp } from '../registry';
import { Scene } from '../scene';
import { applyFields, encodeFields } from '../serialize';

/** What the generated HMR code sends when a scene or object module changes. */
export interface HotUpdate {
  /** Whether a scene or an object module changed. */
  kind: 'scene' | 'object';
  /** Scene folder name, or object registry name (PascalCase). */
  name: string;
  /** Project folder of the module (`scenes/level`, `objects/hero`). */
  path: string;
  /** For scene-local objects: the scene that owns them. */
  scene?: string;
  /** The new module. */
  module: { default?: unknown };
}

/** How an update was applied. */
export type HotResult =
  /** The running scene was rebuilt from the new class and its state restored. */
  | 'replaced'
  /** Live instances run the new methods and keep their state. */
  | 'patched'
  /** Nothing of this class runs; the new class is used from the next `goto`/`spawn`. */
  | 'stored'
  /** The module has no default-exported class: the page should reload. */
  | 'reload';

type Constructor = abstract new (...args: never[]) => object;

// Statics that belong to the class identity or to the registry, never copied between versions.
const KEEP_STATICS = new Set(['length', 'name', 'prototype', 'objectName', 'objectPath']);

/**
 * Makes `previous` behave like `next` without replacing it: methods, accessors and statics are
 * copied over, removed ones deleted, and the parent class follows `next`'s. Instances (and
 * subclasses) of `previous` keep their state and run the new code; references to the class held
 * by other modules stay valid.
 *
 * @example
 * ```ts
 * import { patchClass } from '@blacklight/core/debug';
 *
 * patchClass(OldEnemy, NewEnemy); // live OldEnemy instances now run NewEnemy's methods
 * ```
 */
export function patchClass(previous: Constructor, next: Constructor): void {
  // A subclass of the old version cannot become its own parent.
  if (previous === next || Object.prototype.isPrototypeOf.call(previous.prototype, next.prototype))
    return;
  const from = next.prototype as Record<PropertyKey, unknown>;
  const to = previous.prototype as Record<PropertyKey, unknown>;
  for (const key of Reflect.ownKeys(to))
    if (key !== 'constructor' && !Object.hasOwn(from, key)) delete to[key];
  for (const key of Reflect.ownKeys(from)) {
    if (key === 'constructor') continue;
    Object.defineProperty(to, key, Object.getOwnPropertyDescriptor(from, key)!);
  }
  const parent = Object.getPrototypeOf(from) as object | null;
  if (Object.getPrototypeOf(to) !== parent) Object.setPrototypeOf(to, parent);
  for (const key of Reflect.ownKeys(next)) {
    if (typeof key === 'string' && KEEP_STATICS.has(key)) continue;
    const descriptor = Object.getOwnPropertyDescriptor(next, key)!;
    try {
      Object.defineProperty(previous, key, descriptor);
    } catch {
      // Non-configurable statics stay as they are.
    }
  }
}

/** Fields of a fresh `next` instance that `instance` lacks (a field added to the class). */
function addNewFields(instance: object, fresh: object, skip: ReadonlySet<string>): void {
  const record = instance as Record<string, unknown>;
  for (const [key, value] of Object.entries(fresh)) {
    if (skip.has(key) || Object.hasOwn(record, key)) continue;
    if (
      value === null ||
      typeof value !== 'object' ||
      Object.getPrototypeOf(value) === Object.prototype ||
      Array.isArray(value)
    )
      record[key] = value;
  }
}

/** Every scene that runs: the current one, overlays, and the scenes they host. */
function liveScenes(game: Game): Scene<never>[] {
  const out: Scene<never>[] = [];
  const visit = (scene: Scene<never> | undefined) => {
    if (!scene) return;
    out.push(scene);
    for (const hosted of scene.hosted) visit(hosted);
  };
  visit(game.scene);
  for (const overlay of game.overlays) visit(overlay.scene);
  return out;
}

let sceneBaseKeys: Set<string> | undefined;

/** Every version of each object class seen in this session, oldest first. */
const objectVersions = new Map<string, Constructor[]>();

/** Fields a scene subclass declares (score, references to objects), not the engine's. */
function sceneFields(scene: Scene<never>): string[] {
  sceneBaseKeys ??= new Set(Object.keys(new (class extends Scene {})()));
  return Object.keys(scene).filter((key) => !sceneBaseKeys!.has(key));
}

/**
 * Applies a new version of a scene class. The running scene of that name is rebuilt: a new
 * instance runs `create()` with the same parameters, then gets the old scene's snapshot (objects,
 * cameras, random state) and its own fields (`score`, `this.player`), so the game continues where
 * it was with the new code. Overlays and hosted scenes of that class are patched in place.
 * When the new `create()` throws, the running scene keeps going with the new methods.
 *
 * @example
 * ```ts
 * import { hotReplaceScene } from '@blacklight/core/debug';
 *
 * import.meta.hot?.accept(async (module) => {
 *   if (module) await hotReplaceScene(game, 'level', module.default);
 * });
 * ```
 */
export async function hotReplaceScene(
  game: Game,
  name: string,
  next: typeof Scene,
): Promise<HotResult> {
  game.replaceScene(name, next);
  let result: HotResult = 'stored';
  for (const scene of liveScenes(game)) {
    if (scene.name !== name || scene.constructor === next) continue;
    patchClass(scene.constructor as Constructor, next as unknown as Constructor);
    result = 'patched';
  }
  const old = game.scene;
  if (!old || old.name !== name) return result;

  const scene = new (next as unknown as new () => Scene<never>)();
  scene.init(game, name);
  // Hidden until it takes over, so the half-built scene never shows over the old one.
  scene.stage.visible = false;
  game.world.addChildAt(scene.stage, Math.max(0, game.world.getChildIndex(old.stage)));
  try {
    await scene.start(old.params);
    const snapshot = old.snapshot();
    // Timers hold closures of the old instance; the new create() has scheduled its own.
    scene.restore({ ...snapshot, memory: undefined });
    applyFields(scene, encodeFields(old, sceneFields(old)), (id) => scene.byId(id));
  } catch (error) {
    scene.dispose();
    console.error(
      `[blacklight] Hot reload of scene "${name}": the new create() failed, so the running scene keeps its state with the new methods. Fix the error and save again, or reload the page.`,
      error,
    );
    return 'patched';
  }
  scene.stage.visible = true;
  game.scene = scene;
  old.dispose();
  return 'replaced';
}

/**
 * Applies a new version of an object class: later spawns use it, and live instances (of the class
 * and its subclasses) run the new methods and receive fields added to the class, keeping their
 * state (position, health, animation).
 *
 * @example
 * ```ts
 * import { hotReplaceObject } from '@blacklight/core/debug';
 *
 * import.meta.hot?.accept(async (module) => {
 *   if (module) await hotReplaceObject(game, { name: 'Hero', path: 'objects/hero' }, module.default);
 * });
 * ```
 */
export async function hotReplaceObject(
  game: Game,
  update: { name: string; path: string; scene?: string },
  next: typeof GameObject,
): Promise<HotResult> {
  stamp(next, update.name, update.path);
  const previous = game.replaceObject(update.name, next, update.scene);
  await game.sheets.preload(next as Parameters<Game['sheets']['preload']>[0]);
  const key = `${update.scene ?? ''}/${update.name}`;
  // Instances may come from any earlier version: all of them get the new code.
  const versions = objectVersions.get(key) ?? (previous ? [previous] : []);
  objectVersions.set(key, [...versions.filter((v) => v !== next), next]);
  if (versions.length === 0 || (versions.length === 1 && versions[0] === next)) return 'stored';
  for (const version of versions) patchClass(version, next);
  const live = liveScenes(game)
    .flatMap((scene) => scene.objects)
    .filter((object) => versions.some((version) => object instanceof version));
  if (live.length === 0) return 'stored';
  const fresh = new (next as unknown as new () => GameObject)();
  for (const object of live) addNewFields(object, fresh, object.engineKeys);
  return 'patched';
}

declare global {
  var __blacklightHot: ((update: HotUpdate) => Promise<HotResult>) | undefined;
}

/**
 * Connects the game to the hot-reload code the CLI adds to scene and object modules. The
 * generated entry calls it in dev.
 *
 * @returns A function that disconnects it.
 * @example
 * ```ts
 * if (import.meta.env.DEV) installHotReload(game);
 * ```
 */
export function installHotReload(game: Game): () => void {
  globalThis.__blacklightHot = async (update) => {
    const type = update.module.default;
    if (typeof type !== 'function') return 'reload';
    const result =
      update.kind === 'scene'
        ? type.prototype instanceof Scene
          ? await hotReplaceScene(game, update.name, type as typeof Scene)
          : 'reload'
        : type.prototype instanceof GameObject
          ? await hotReplaceObject(game, update, type as typeof GameObject)
          : 'reload';
    if (result !== 'reload') console.info(`[blacklight] hot reload: ${update.path} (${result})`);
    return result;
  };
  return () => {
    globalThis.__blacklightHot = undefined;
  };
}
