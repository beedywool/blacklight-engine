import type { Scene } from './scene';

/** A scene class as exported by `scenes/<name>/<name>.scene.ts`. */
export type SceneClass = new () => Scene<never>;

/** Loads one scene module on demand; each scene is its own chunk. */
export type SceneLoader = () => Promise<{ default: SceneClass }>;

const SCENE_PATH = /(?:^|\/)scenes\/([^/]+)\/([^/]+)\.scene\.[cm]?[jt]s$/;

/**
 * Turns the result of `import.meta.glob('…/scenes/*\/*.scene.ts')` into a name → loader map. The
 * scene name is its folder name.
 *
 * @throws Error when a file name does not match its folder (`scenes/title/menu.scene.ts`).
 */
export function scenesFromGlob(
  modules: Record<string, () => Promise<unknown>>,
): Record<string, SceneLoader> {
  const scenes: Record<string, SceneLoader> = {};
  for (const [path, load] of Object.entries(modules)) {
    const match = SCENE_PATH.exec(path);
    if (!match) continue;
    const [, folder, file] = match as unknown as [string, string, string];
    if (folder !== file) {
      throw new Error(
        `Scene file "${path}" must be named after its folder: rename it to scenes/${folder}/${folder}.scene.ts.`,
      );
    }
    scenes[folder] = load as SceneLoader;
  }
  return scenes;
}
