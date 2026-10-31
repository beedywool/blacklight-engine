import type { GameObject, GameObjectClass } from './objects/game-object';

/** Imports an object module on demand; its default export is the object class. */
export type ObjectLoader = () => Promise<{ default: GameObjectClass }>;

/** Object classes discovered in the project, loaded on demand. */
export interface ObjectRegistry {
  /** `objects/<name>/<name>.object.ts`, by PascalCase name. */
  global: Record<
    string,
    {
      /** Project folder of the object (`objects/big-enemy`). */
      path: string;
      /** Imports the object's module. */
      load: ObjectLoader;
    }
  >;
  /** `scenes/<scene>/objects/<name>/<name>.object.ts`, by scene then name. */
  scenes: Record<
    string,
    Record<
      string,
      {
        /** Project folder of the object (`scenes/level/objects/door`). */
        path: string;
        /** Imports the object's module. */
        load: ObjectLoader;
      }
    >
  >;
}

const GLOBAL = /(?:^|\/)objects\/([^/]+)\/([^/]+)\.object\.[cm]?[jt]s$/;
const LOCAL = /(?:^|\/)scenes\/([^/]+)\/objects\/([^/]+)\/([^/]+)\.object\.[cm]?[jt]s$/;

/**
 * Turns a folder name into the registry name of its object: `big-enemy` → `BigEnemy`.
 *
 * @example
 * ```ts
 * import { pascalCase } from '@blacklight/core';
 *
 * pascalCase('big-enemy'); // 'BigEnemy'
 * ```
 */
export function pascalCase(folder: string): string {
  return folder
    .split(/[-_\s]+/)
    .filter(Boolean)
    .map((part) => part[0]!.toUpperCase() + part.slice(1))
    .join('');
}

/**
 * Turns `import.meta.glob` results for `objects/*\/*.object.ts` and
 * `scenes/*\/objects/*\/*.object.ts` into a registry. Objects are named after their folder.
 *
 * @throws Error when a file name does not match its folder.
 * @example
 * ```ts
 * import { createGame, objectsFromGlob } from '@blacklight/core';
 *
 * const objects = objectsFromGlob(
 *   import.meta.glob(['./objects/*\/*.object.ts', './scenes/*\/objects/*\/*.object.ts']),
 * );
 * await createGame(config, { scenes, objects, mount: document.getElementById('game')! });
 * ```
 */
export function objectsFromGlob(modules: Record<string, () => Promise<unknown>>): ObjectRegistry {
  const registry: ObjectRegistry = { global: {}, scenes: {} };
  for (const [file, load] of Object.entries(modules)) {
    const local = LOCAL.exec(file);
    if (local) {
      const [, scene, folder, name] = local as unknown as [string, string, string, string];
      if (folder !== name) throw misnamed(file, `scenes/${scene}/objects/${folder}`, folder);
      (registry.scenes[scene] ??= {})[pascalCase(folder)] = {
        path: `scenes/${scene}/objects/${folder}`,
        load: load as ObjectLoader,
      };
      continue;
    }
    const global = GLOBAL.exec(file);
    if (global) {
      const [, folder, name] = global as unknown as [string, string, string];
      if (folder !== name) throw misnamed(file, `objects/${folder}`, folder);
      registry.global[pascalCase(folder)] = {
        path: `objects/${folder}`,
        load: load as ObjectLoader,
      };
    }
  }
  return registry;
}

function misnamed(file: string, dir: string, folder: string): Error {
  return new Error(
    `Object file "${file}" must be named after its folder: rename it to ${dir}/${folder}.object.ts.`,
  );
}

/** Registry name of a class: its own `objectName`, else its JavaScript name. */
export function nameOf(type: typeof GameObject): string {
  return Object.hasOwn(type, 'objectName') && type.objectName ? type.objectName : type.name;
}

/** Gives a discovered class its registry name and folder. */
export function stamp(type: typeof GameObject, name: string, path: string): void {
  if (!Object.hasOwn(type, 'objectName'))
    Object.defineProperty(type, 'objectName', { value: name, writable: true });
  if (!Object.hasOwn(type, 'objectPath'))
    Object.defineProperty(type, 'objectPath', { value: path, writable: true });
}
