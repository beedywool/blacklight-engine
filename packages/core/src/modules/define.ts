import type { EventBus, Unsubscribe } from '../events';
import type { Game } from '../game';
import type { Platform, PlatformName } from '../platform';
import type { Register } from '../register';
import type { ModuleNetwork } from './network';
import type { Schema } from './schema';

/**
 * Events shared by every module of a game (`context.events`). Modules add theirs by declaration
 * merging, prefixed with their name.
 *
 * @example
 * ```ts
 * declare module '@blacklight/core' {
 *   interface ModuleEvents {
 *     'accounts:login': { subject: string };
 *   }
 * }
 * ```
 */
// eslint-disable-next-line @typescript-eslint/no-empty-object-type
export interface ModuleEvents {}

/** Messages of one module, prefixed with its name; `debug` lines only show in dev builds. */
export interface ModuleLogger {
  debug(...args: unknown[]): void;
  info(...args: unknown[]): void;
  warn(...args: unknown[]): void;
  error(...args: unknown[]): void;
}

/** JSON values a module keeps on the device (`modules/<name>/` in the game's data folder). */
export interface ModuleStorage {
  get<T>(key: string): Promise<T | undefined>;
  set(key: string, value: unknown): Promise<void>;
  remove(key: string): Promise<void>;
}

/** A save slot as the save system describes it to modules. */
export interface ModuleSaveSlot {
  slot: string;
  /** Last write, ms since the epoch. */
  updatedAt: number;
}

/**
 * What modules need from the save system (`game.save`, SV-01) to sync saves elsewhere: a slot is
 * exported as opaque, portable bytes and imported back. The save system implements this interface;
 * `context.saves` is `undefined` when the game has none.
 *
 * @example
 * ```ts
 * context.saves?.onSaved(async (slot) => upload(slot, await context.saves!.exportSlot(slot)));
 * ```
 */
export interface ModuleSaves {
  slots(): Promise<ModuleSaveSlot[]>;
  /** Portable bytes of a slot, `undefined` when it is empty. */
  exportSlot(slot: string): Promise<Uint8Array | undefined>;
  /** Replaces a slot with bytes from {@link exportSlot} (another device, the cloud). */
  importSlot(slot: string, data: Uint8Array): Promise<void>;
  /** Called after each successful write of a slot. */
  onSaved(listener: (slot: string) => void): Unsubscribe;
}

/**
 * Module APIs by name, as `game.modules` exposes them. Filled by the CLI from `game.config.ts`
 * (`.blacklight/types.d.ts`); a plain record before the types are generated.
 */
export type GameModules = Register extends { modules: infer M } ? M : Record<string, unknown>;

/** Configuration of every module listed in `game.config.ts`, typed from the module definitions. */
export type ModulesConfig = Register extends { moduleConfigs: infer M }
  ? { [K in keyof M]: M[K] }
  : Record<string, object>;

/** What `setup` receives (MOD-02). */
export interface ModuleContext<Config = unknown> {
  /** Module name, the key under `game.modules` and `modules` in `game.config.ts`. */
  readonly name: string;
  /** The module's configuration from `game.config.ts`, checked and with defaults. */
  readonly config: Config;
  readonly game: Game;
  /** Platform services: files, `invoke` for native calls, events, `openUrl`. */
  readonly platform: Platform;
  /** Bus shared by all modules (see {@link ModuleEvents}). Engine events are on `game.events`. */
  readonly events: EventBus<ModuleEvents>;
  /** APIs of the modules set up before this one (its `dependencies` come first). */
  readonly modules: GameModules;
  /** The save system, when the game has one. */
  readonly saves: ModuleSaves | undefined;
  /** Online state and offline queues with retry. */
  readonly network: ModuleNetwork;
  readonly log: ModuleLogger;
  /** Private JSON storage of this module on the device. */
  readonly storage: ModuleStorage;
  /** `true` in `blacklight dev`, `false` in builds. */
  readonly dev: boolean;
  /** Runs `dispose` when the game shuts down, in reverse order of registration. */
  onDispose(dispose: () => void | Promise<void>): void;
}

/** A module, as {@link defineModule} returns it. */
export interface ModuleDefinition<
  Name extends string = string,
  Config = unknown,
  Api = unknown,
  ConfigInput = Config,
  Platforms extends readonly PlatformName[] = readonly PlatformName[],
> {
  readonly name: Name;
  /** Semver version of the module. */
  readonly version: string;
  /** Platforms the module runs on; omitted means all. Elsewhere it is skipped (API `undefined`). */
  readonly platforms?: Platforms;
  /** Schema of the module's entry in `game.config.ts` `modules`. */
  readonly config?: Schema<Config, ConfigInput>;
  /** Modules set up before this one; a missing one stops the game with an error. */
  readonly dependencies?: readonly string[];
  /** Builds the module; the returned object becomes `game.modules.<name>`. */
  setup(context: ModuleContext<Config>): Api | Promise<Api>;
  /** Called on shutdown with the API `setup` returned. */
  dispose?(api: Api, context: ModuleContext<Config>): void | Promise<void>;
  /** @internal Brand that lets the generated entry find definitions among a file's exports. */
  readonly blacklightModule: true;
}

/** A definition of any module. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type AnyModuleDefinition = ModuleDefinition<string, any, any, any, readonly PlatformName[]>;

/**
 * API type of a module definition: `undefined` is added when the module only runs on some
 * platforms.
 */
export type ModuleApi<D> =
  D extends ModuleDefinition<
    string,
    unknown,
    infer Api,
    unknown,
    infer P extends readonly PlatformName[]
  >
    ? [Exclude<PlatformName, P[number]>] extends [never]
      ? Awaited<Api>
      : Awaited<Api> | undefined
    : never;

/** Configuration type accepted in `game.config.ts` for a module definition. */
export type ModuleConfigInput<D> =
  D extends ModuleDefinition<string, unknown, unknown, infer In, readonly PlatformName[]>
    ? In
    : never;

/**
 * API of the module named `N` among the exports of a file or package (used by the generated
 * `.blacklight/types.d.ts`).
 */
export type ModuleApiOf<Exports, N extends string> = {
  [K in keyof Exports]: Exports[K] extends ModuleDefinition<
    N,
    unknown,
    unknown,
    unknown,
    readonly PlatformName[]
  >
    ? ModuleApi<Exports[K]>
    : never;
}[keyof Exports];

/** Configuration input of the module named `N` among the exports of a file or package. */
export type ModuleConfigOf<Exports, N extends string> = {
  [K in keyof Exports]: Exports[K] extends ModuleDefinition<
    N,
    unknown,
    unknown,
    unknown,
    readonly PlatformName[]
  >
    ? ModuleConfigInput<Exports[K]>
    : never;
}[keyof Exports];

/** What {@link defineModule} accepts. */
export interface ModuleOptions<
  Name extends string,
  Config,
  ConfigInput,
  Api,
  Platforms extends readonly PlatformName[],
> {
  name: Name;
  version: string;
  platforms?: Platforms;
  config?: Schema<Config, ConfigInput>;
  dependencies?: readonly string[];
  setup(context: ModuleContext<Config>): Api | Promise<Api>;
  dispose?(api: Api, context: ModuleContext<Config>): void | Promise<void>;
}

const NAME_PATTERN = /^[a-z][a-z0-9-]*$/;

/**
 * Declares a module (MOD-01). List it in `game.config.ts` under `modules` and the object returned
 * by `setup` becomes `game.modules.<name>`, typed.
 *
 * @example
 * ```ts
 * // modules/score/score.module.ts
 * import { defineModule, t } from '@blacklight/core';
 *
 * export const score = defineModule({
 *   name: 'score',
 *   version: '1.0.0',
 *   config: t.object({ best: t.number().default(0) }),
 *   setup({ config, storage }) {
 *     let best = config.best;
 *     return {
 *       get best() { return best; },
 *       async submit(points: number) {
 *         if (points > best) await storage.set('best', (best = points));
 *       },
 *     };
 *   },
 * });
 *
 * // anywhere in the game
 * game.modules.score.submit(120);
 * ```
 */
export function defineModule<
  Name extends string,
  Api,
  Config = undefined,
  ConfigInput = Config,
  Platforms extends readonly PlatformName[] = readonly PlatformName[],
>(
  options: ModuleOptions<Name, Config, ConfigInput, Api, Platforms>,
): ModuleDefinition<Name, Config, Api, ConfigInput, Platforms> {
  if (!NAME_PATTERN.test(options.name)) {
    throw new Error(
      `Module name "${options.name}" is invalid: use lowercase letters, digits and dashes, starting with a letter (e.g. "high-scores").`,
    );
  }
  return { ...options, blacklightModule: true };
}

/** `true` when `value` was made by {@link defineModule}. */
export function isModuleDefinition(value: unknown): value is AnyModuleDefinition {
  return (
    typeof value === 'object' &&
    value !== null &&
    (value as { blacklightModule?: unknown }).blacklightModule === true
  );
}

/**
 * Finds the module named `name` among a file's or package's exports (the generated entry imports
 * each module as a namespace).
 *
 * @throws Error naming the file and the module names it does export.
 */
export function pickModule(
  exports: Record<string, unknown>,
  name: string,
  from: string,
): AnyModuleDefinition {
  const found = Object.values(exports).filter(isModuleDefinition);
  const match = found.find((definition) => definition.name === name);
  if (match) return match;
  throw new Error(
    found.length === 0
      ? `${from} does not export a module. Export the result of defineModule({ name: '${name}', ... }).`
      : `${from} exports the module${found.length > 1 ? 's' : ''} ${found.map((d) => `"${d.name}"`).join(', ')}, not "${name}". Rename the key in game.config.ts \`modules\` or the module's \`name\`.`,
  );
}
