import { parseBinding } from './input/bindings';
import type { InputConfig } from './input/input';

/**
 * How the virtual resolution fits the screen.
 *
 * - `extend`: the design area is scaled to fit and centered; the extra space on the long side shows
 *   more of the scene (backgrounds overflow, UI anchors to the safe area).
 * - `letterbox`: the design area is scaled to fit and the rest of the screen stays black.
 */
export type ResolutionMode = 'extend' | 'letterbox';

export interface ResolutionConfig {
  /** Design width in virtual pixels. */
  width: number;
  /** Design height in virtual pixels. */
  height: number;
  /** @defaultValue `'extend'` */
  mode?: ResolutionMode;
  /** Nearest-neighbour filtering, integer scaling and integer positions. @defaultValue `false` */
  pixelArt?: boolean;
}

/**
 * The content of `game.config.ts`.
 *
 * @example
 * ```ts
 * export default defineConfig({
 *   name: 'My Game',
 *   id: 'com.example.mygame',
 *   version: '1.0.0',
 *   entry: 'title',
 *   resolution: { width: 1920, height: 1080, mode: 'extend' },
 * });
 * ```
 */
export interface GameConfig {
  /** Display name: window title, store listings. */
  name: string;
  /** Reverse-domain identifier (`com.studio.game`), used for app ids and save folders. */
  id: string;
  /** Semver version of the game. */
  version: string;
  /** Name of the first scene (the folder name under `scenes/`). */
  entry: string;
  resolution: ResolutionConfig;
  /** Logic steps per second. @defaultValue `60` */
  tickRate?: number;
  /** Pause the loop while the window is hidden or unfocused. @defaultValue `true` */
  pauseOnBlur?: boolean;
  /**
   * Input actions and their bindings, merged over the defaults (left, right, up, down, confirm,
   * back, pause, jump, action).
   *
   * @example
   * ```ts
   * input: { actions: { fire: ['KeyJ', 'Mouse:Left', 'Pad:RT'] } }
   * ```
   */
  input?: InputConfig;
  /** Seed of `game.random` and of every scene's generator. Omitted: a new seed each run. */
  seed?: string | number;
  /** UI layer defaults (`@blacklight/ui`); the player's saved choices win. */
  ui?: { theme?: string; scale?: number };
  /**
   * Languages (`locales/<lang>.json`, `@blacklight/ui`). `default` is used when the player's
   * language has no file; `fallback` fills keys missing from the current language.
   * @defaultValue `{ default: 'en', fallback: 'en' }`
   */
  locales?: { default?: string; fallback?: string };
}

export interface ResolvedGameConfig
  extends
    Required<Omit<GameConfig, 'resolution' | 'input' | 'seed' | 'ui' | 'locales'>>,
    Pick<GameConfig, 'input' | 'seed' | 'ui' | 'locales'> {
  resolution: Required<ResolutionConfig>;
}

/**
 * Declares the game configuration. It returns its argument unchanged; its role is to give
 * `game.config.ts` complete types and completion.
 */
export function defineConfig(config: GameConfig): GameConfig {
  return config;
}

/** Thrown when `game.config.ts` is invalid. `issues` holds one readable line per problem. */
export class ConfigError extends Error {
  constructor(readonly issues: string[]) {
    super(`game.config.ts is invalid:\n${issues.map((issue) => `  - ${issue}`).join('\n')}`);
    this.name = 'ConfigError';
  }
}

const ID_PATTERN = /^[a-z][a-z0-9_]*(\.[a-z][a-z0-9_]*)+$/;
const SEMVER_PATTERN = /^\d+\.\d+\.\d+(-[0-9A-Za-z.-]+)?(\+[0-9A-Za-z.-]+)?$/;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isPositiveInteger(value: unknown): value is number {
  return typeof value === 'number' && Number.isInteger(value) && value > 0;
}

/**
 * Validates a configuration and fills in defaults. Every problem is collected so the developer
 * fixes them in one pass instead of one error per reload.
 *
 * @throws {@link ConfigError} listing every invalid field and how to fix it.
 */
export function resolveConfig(input: unknown): ResolvedGameConfig {
  const issues: string[] = [];
  if (!isRecord(input)) {
    throw new ConfigError([
      'the default export must be an object: `export default defineConfig({ ... })`',
    ]);
  }
  const { name, id, version, entry, resolution, tickRate = 60, pauseOnBlur = true, seed } = input;
  const inputConfig = input.input;

  if (typeof name !== 'string' || name.trim() === '') {
    issues.push('`name` must be a non-empty string, e.g. `name: "My Game"`');
  }
  if (typeof id !== 'string' || !ID_PATTERN.test(id)) {
    issues.push(
      '`id` must be a lowercase reverse-domain identifier, e.g. `id: "com.example.mygame"`',
    );
  }
  if (typeof version !== 'string' || !SEMVER_PATTERN.test(version)) {
    issues.push('`version` must be a semver string, e.g. `version: "1.0.0"`');
  }
  if (typeof entry !== 'string' || entry === '') {
    issues.push(
      '`entry` must name the first scene, e.g. `entry: "title"` for scenes/title/title.scene.ts',
    );
  }

  let width = 0;
  let height = 0;
  let mode: ResolutionMode = 'extend';
  let pixelArt = false;
  if (!isRecord(resolution)) {
    issues.push('`resolution` is required, e.g. `resolution: { width: 1920, height: 1080 }`');
  } else {
    if (!isPositiveInteger(resolution.width) || !isPositiveInteger(resolution.height)) {
      issues.push('`resolution.width` and `resolution.height` must be positive integers');
    } else {
      width = resolution.width;
      height = resolution.height;
    }
    if (resolution.mode !== undefined) {
      if (resolution.mode !== 'extend' && resolution.mode !== 'letterbox') {
        issues.push('`resolution.mode` must be "extend" or "letterbox"');
      } else {
        mode = resolution.mode;
      }
    }
    if (resolution.pixelArt !== undefined) {
      if (typeof resolution.pixelArt !== 'boolean')
        issues.push('`resolution.pixelArt` must be a boolean');
      else pixelArt = resolution.pixelArt;
    }
  }

  if (!isPositiveInteger(tickRate) || tickRate > 1000) {
    issues.push('`tickRate` must be an integer between 1 and 1000 (steps per second)');
  }
  if (typeof pauseOnBlur !== 'boolean') {
    issues.push('`pauseOnBlur` must be a boolean');
  }
  if (input.ui !== undefined && !isRecord(input.ui)) {
    issues.push('`ui` must be an object, e.g. `ui: { theme: "persona" }`');
  }
  if (
    input.locales !== undefined &&
    (!isRecord(input.locales) ||
      Object.values(input.locales).some((lang) => typeof lang !== 'string'))
  ) {
    issues.push('`locales` must be an object of language codes, e.g. `locales: { default: "en" }`');
  }
  if (seed !== undefined && typeof seed !== 'string' && typeof seed !== 'number') {
    issues.push('`seed` must be a string or a number');
  }
  if (inputConfig !== undefined) {
    if (!isRecord(inputConfig))
      issues.push('`input` must be an object, e.g. `input: { actions: { fire: ["KeyJ"] } }`');
    else {
      const { actions, deadzone } = inputConfig;
      if (actions !== undefined && !isRecord(actions))
        issues.push('`input.actions` must map action names to binding lists');
      for (const [action, list] of Object.entries(isRecord(actions) ? actions : {})) {
        if (!Array.isArray(list)) {
          issues.push(
            `\`input.actions.${action}\` must be a list of bindings, e.g. ["Space", "Pad:A"]`,
          );
          continue;
        }
        for (const binding of list) {
          try {
            parseBinding(String(binding));
          } catch (error) {
            issues.push(`\`input.actions.${action}\`: ${(error as Error).message}`);
          }
        }
      }
      if (
        deadzone !== undefined &&
        (typeof deadzone !== 'number' || deadzone < 0 || deadzone >= 1)
      ) {
        issues.push('`input.deadzone` must be a number from 0 to 1 (excluded)');
      }
    }
  }

  if (issues.length > 0) throw new ConfigError(issues);
  return {
    name: name as string,
    id: id as string,
    version: version as string,
    entry: entry as string,
    resolution: { width, height, mode, pixelArt },
    tickRate: tickRate as number,
    pauseOnBlur: pauseOnBlur as boolean,
    input: inputConfig as InputConfig | undefined,
    seed: seed as string | number | undefined,
    ui: input.ui as GameConfig['ui'],
    locales: input.locales as GameConfig['locales'],
  };
}
