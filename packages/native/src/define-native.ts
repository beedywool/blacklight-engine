// Native parts of modules (MOD-03). This file runs in the Electron main process and has no
// imports, so it loads in any Node context; argument schemas come from `@blacklight/core/schema`
// (`t.string()`…), which matches the structural `ArgSchema` type below.

/** A runtime check for one argument; `t.*` schemas from `@blacklight/core/schema` fit. */
export interface ArgSchema<T> {
  /** Short description used in error messages (`"a string"`). */
  readonly description: string;
  /**
   * Checks `value`, pushing one readable line per problem into `issues`, and returns the value
   * with defaults applied (meaningless when an issue was added).
   */
  check(value: unknown, path: string, issues: string[]): T;
}

/** What a native function receives besides its arguments. */
export interface NativeContext {
  /** Game id from `game.config.ts` (`com.studio.game`). */
  readonly gameId: string;
  /** The game's private data folder (OS standard location, or the configured override). */
  readonly dataDir: string;
  /** `true` in development builds. */
  readonly dev: boolean;
}

/** One function exposed to the game. */
export interface NativeFunction<Args extends unknown[] = unknown[], Result = unknown> {
  /** One schema per argument, in order. */
  readonly args: { readonly [K in keyof Args]: ArgSchema<Args[K]> };
  /** The body, called with the checked arguments. */
  run(context: NativeContext, ...args: Args): Result | Promise<Result>;
}

/** Any native function, whatever its arguments. */
export interface AnyNativeFunction {
  /** One schema per argument, in order. */
  readonly args: readonly ArgSchema<unknown>[];
  /** The body, called with the checked arguments. */
  run(context: NativeContext, ...args: never[]): unknown;
}

type ArgsOf<S extends readonly ArgSchema<unknown>[]> = {
  -readonly [K in keyof S]: S[K] extends ArgSchema<infer T> ? T : never;
};

/**
 * Declares a function of a native part: its argument schemas and its body. Arguments are checked
 * before `run` is called; a call with wrong arguments is refused with a readable message.
 *
 * @example
 * ```ts
 * import { t } from '@blacklight/core/schema';
 *
 * const add = fn([t.number(), t.number()], (_context, a, b) => a + b);
 * ```
 */
export function fn<const S extends readonly ArgSchema<unknown>[], Result>(
  args: S,
  run: (context: NativeContext, ...args: ArgsOf<S>) => Result | Promise<Result>,
): NativeFunction<ArgsOf<S>, Result> {
  return { args: args as unknown as NativeFunction<ArgsOf<S>, Result>['args'], run };
}

/** Options of {@link defineNative}. */
export interface NativeOptions<Name extends string, Functions> {
  /** Name used with `platform.invoke(name, …)`; the Capacitor plugin on mobile has the same name. */
  name: Name;
  /** Functions the game may call. Nothing else in the file is reachable from the game. */
  functions: Functions;
  /** Runs once when the main process registers the module. */
  setup?(context: NativeContext): void | Promise<void>;
  /** Runs when the app quits (close databases, flush files). */
  dispose?(context: NativeContext): void | Promise<void>;
}

/**
 * A native part, as {@link defineNative} returns it. This is the registration contract with the
 * Electron main process of `@blacklight/native`: the main process keeps one module per `name`,
 * calls `setup` once, answers each `invoke(name, method, ...args)` from the renderer with
 * `call(method, args, context)` (which refuses unknown methods and invalid arguments), and calls
 * `dispose` on quit. Only `methods` cross the IPC bridge; return values must be
 * structured-clone-able (plain objects, arrays, strings, numbers, Uint8Array…).
 */
export interface NativeModule<
  Name extends string = string,
  Functions extends Record<string, AnyNativeFunction> = Record<string, AnyNativeFunction>,
> {
  /** Name used with `platform.invoke(name, …)`. */
  readonly name: Name;
  /** The declared functions, by name. */
  readonly functions: Functions;
  /** Names of the exposed functions. */
  readonly methods: readonly string[];
  /**
   * Checks the arguments and runs the function.
   *
   * @throws Error for an unknown method or invalid arguments, saying what was expected.
   */
  call(method: string, args: unknown[], context: NativeContext): Promise<unknown>;
  /** Runs once when the main process registers the module. */
  setup?(context: NativeContext): void | Promise<void>;
  /** Runs when the app quits. */
  dispose?(context: NativeContext): void | Promise<void>;
  /** Brand checked by the main process before registering. */
  readonly blacklightNative: true;
}

const NAME_PATTERN = /^[a-z][a-z0-9-]*$/;

/**
 * Declares the native part of a module (MOD-03): Node code that runs in the Electron main process
 * (better-sqlite3, the file system, OS APIs). The game calls it through `platform.invoke` or, with
 * types, `nativeModule<typeof myNative>(platform, 'my-native')` from `@blacklight/core`, importing
 * the definition with `import type` so no Node code reaches the game bundle. On mobile a Capacitor
 * plugin with the same name and methods answers the same calls.
 *
 * @example
 * ```ts
 * // modules/notes/native.ts — runs in the Electron main process
 * import { readFile } from 'node:fs/promises';
 * import { join } from 'node:path';
 * import { t } from '@blacklight/core/schema';
 * import { defineNative, fn } from '@blacklight/native';
 *
 * export const notesNative = defineNative({
 *   name: 'notes',
 *   functions: {
 *     read: fn([t.string({ pattern: /^[a-z0-9-]+$/ })], (context, id) =>
 *       readFile(join(context.dataDir, 'notes', `${id}.txt`), 'utf8'),
 *     ),
 *   },
 * });
 *
 * // modules/notes/notes.module.ts — runs in the game
 * import type { notesNative } from './native';
 * const notes = nativeModule<typeof notesNative>(context.platform, 'notes');
 * const text = await notes.read('intro'); // string
 * ```
 */
export function defineNative<
  Name extends string,
  Functions extends Record<string, AnyNativeFunction>,
>(options: NativeOptions<Name, Functions>): NativeModule<Name, Functions> {
  if (!NAME_PATTERN.test(options.name)) {
    throw new Error(
      `Native module name "${options.name}" is invalid: use lowercase letters, digits and dashes, starting with a letter.`,
    );
  }
  const methods = Object.keys(options.functions);
  // Own-property lookups only: "constructor", "__proto__" or "toString" must never be callable.
  const table = new Map<string, NativeFunction<unknown[], unknown>>(
    Object.entries(options.functions) as unknown as [string, NativeFunction<unknown[], unknown>][],
  );
  return {
    name: options.name,
    functions: options.functions,
    methods,
    setup: options.setup,
    dispose: options.dispose,
    blacklightNative: true,
    async call(method, args, context) {
      const target = table.get(method);
      if (!target) {
        throw new Error(
          `"${options.name}.${method}" does not exist. Exposed functions: ${methods.join(', ') || 'none'}.`,
        );
      }
      if (!Array.isArray(args)) {
        throw new Error(`"${options.name}.${method}" expects its arguments as an array.`);
      }
      const schemas = target.args as readonly ArgSchema<unknown>[];
      const issues: string[] = [];
      const optionalTail = schemas.filter((s) => s.description.endsWith('(optional)')).length;
      if (args.length > schemas.length || args.length < schemas.length - optionalTail) {
        issues.push(
          `expected ${schemas.length === 1 ? '1 argument' : `${schemas.length} arguments`}, got ${args.length}`,
        );
      }
      const checked = schemas.map((schema, i) =>
        schema.check(args[i], `argument ${i + 1}`, issues),
      );
      if (issues.length > 0) {
        throw new Error(`"${options.name}.${method}" refused its arguments: ${issues.join('; ')}.`);
      }
      return target.run(context, ...checked);
    },
  };
}

/**
 * `true` when `value` was made by {@link defineNative}. The main process checks the exports of a
 * module's native file with it before registering them.
 *
 * @example
 * ```ts
 * import { isNativeModule } from '@blacklight/native/define-native';
 *
 * const natives = Object.values(await import('./modules/notes/native')).filter(isNativeModule);
 * ```
 */
export function isNativeModule(value: unknown): value is NativeModule {
  return (
    typeof value === 'object' &&
    value !== null &&
    (value as { blacklightNative?: unknown }).blacklightNative === true
  );
}
