import type { GameObject, GameObjectClass } from './objects/game-object';

export type ObjectLoader = () => Promise<{ default: GameObjectClass }>;

/** Object classes discovered in the project, loaded on demand. */
export interface ObjectRegistry {
  /** `objects/<name>/<name>.object.ts`, by PascalCase name. */
  global: Record<string, { path: string; load: ObjectLoader }>;
  /** `scenes/<scene>/objects/<name>/<name>.object.ts`, by scene then name. */
  scenes: Record<string, Record<string, { path: string; load: ObjectLoader }>>;
}

const GLOBAL = /(?:^|\/)objects\/([^/]+)\/([^/]+)\.object\.[cm]?[jt]s$/;
const LOCAL = /(?:^|\/)scenes\/([^/]+)\/objects\/([^/]+)\/([^/]+)\.object\.[cm]?[jt]s$/;

/** `big-enemy` → `BigEnemy`. */
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
