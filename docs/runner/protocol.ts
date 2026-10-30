// Messages between a docs page (live example, playground) and the runner iframe.

/**
 * A project file: text for code, JSON and SVG; a URL (`data:` or same-origin) for binary assets.
 */
export type ProjectFiles = Record<string, string>;

/** Page → runner: run these files. */
export interface RunMessage {
  type: 'blacklight:run';
  /**
   * `example`: `main.ts` is a scene module (default export), its folder siblings sit next to it;
   * `project`: the files form a game project (`game.config.ts`, `scenes/`, `objects/`, `ui/`).
   */
  mode: 'example' | 'project';
  files: ProjectFiles;
}

/** Runner → page. */
export type RunnerMessage =
  | { type: 'blacklight:ready' }
  | { type: 'blacklight:running'; report: RenderReport }
  | { type: 'blacklight:error'; message: string };

/** What the runner saw once the game ran for a few frames. */
export interface RenderReport {
  /** Canvas size in device pixels. */
  width: number;
  height: number;
  /** Pixels of the stage that are not transparent. */
  lit: number;
  /** Elements in the UI layer. */
  uiElements: number;
  /** Scene that is running. */
  scene: string;
}

/** Runner page, relative to the site root. */
export const RUNNER_PATH = 'runner/index.html';
