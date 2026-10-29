import { type InferArgs, type Validator, ValidationError } from './validate';

/** A function the page may call, with the shape of each argument. */
export interface NativeMethod {
  readonly args: readonly Validator<unknown>[];
  run(...args: never[]): unknown;
}

/**
 * Declares a native method: arguments are validated, then `run` gets them typed.
 *
 * @example
 * ```ts
 * const add = method([v.number(), v.number()], (a, b) => a + b);
 * ```
 */
export function method<const A extends readonly Validator<unknown>[], R>(
  args: A,
  run: (...args: InferArgs<A>) => R,
): NativeMethod {
  return { args, run: run as (...args: never[]) => unknown };
}

const MODULE_NAME = /^[a-z][a-z0-9-]{0,63}$/;
const METHOD_NAME = /^[a-zA-Z][a-zA-Z0-9]{0,63}$/;

const modules = new Map<string, Map<string, NativeMethod>>();

/**
 * Makes `methods` callable from the page as `game.platform.invoke(module, method, ...args)`. This
 * is the allowlist of the IPC bridge: nothing else in the main process can be reached. Engine
 * modules (`steam`, `discord`, `sdl`, `files`, `keystore`, `window`, `shell`) and `defineNative`
 * modules register this way.
 *
 * @returns A function that unregisters the module.
 * @throws Error when the name is invalid or already taken.
 *
 * @example
 * ```ts
 * registerNative('clipboard', {
 *   write: method([v.string({ max: 100_000 })], (text) => clipboard.writeText(text)),
 * });
 * ```
 */
export function registerNative(module: string, methods: Record<string, NativeMethod>): () => void {
  if (!MODULE_NAME.test(module)) {
    throw new Error(
      `Invalid native module name "${module}": use lowercase letters, digits and "-", starting with a letter.`,
    );
  }
  if (modules.has(module)) {
    throw new Error(`The native module "${module}" is already registered: pick another name.`);
  }
  const table = new Map<string, NativeMethod>();
  for (const [name, definition] of Object.entries(methods)) {
    if (!METHOD_NAME.test(name)) {
      throw new Error(`Invalid method name "${module}.${name}": use letters and digits.`);
    }
    if (!Array.isArray(definition.args) || typeof definition.run !== 'function') {
      throw new Error(
        `"${module}.${name}" must be declared with method([validators], handler) so its arguments are checked.`,
      );
    }
    table.set(name, definition);
  }
  modules.set(module, table);
  return () => {
    if (modules.get(module) === table) modules.delete(module);
  };
}

/** Names of the registered modules and their methods. */
export function registeredNatives(): Record<string, string[]> {
  return Object.fromEntries([...modules].map(([name, table]) => [name, [...table.keys()]]));
}

/**
 * Runs a call that came from the page: module and method must be registered, the arguments must
 * match their validators.
 *
 * @throws Error with a message safe to send back to the page.
 */
export async function callNative(module: unknown, name: unknown, args: unknown): Promise<unknown> {
  if (typeof module !== 'string' || typeof name !== 'string' || !Array.isArray(args)) {
    throw new Error('Malformed native call.');
  }
  const definition = modules.get(module)?.get(name);
  if (!definition) {
    throw new Error(
      modules.has(module)
        ? `"${module}.${name}" is not a native method; available: ${[...modules.get(module)!.keys()].join(', ')}.`
        : `No native module "${module}" in this app.`,
    );
  }
  if (args.length > definition.args.length) {
    throw new ValidationError(
      `${module}.${name}`,
      `called with at most ${definition.args.length} arguments`,
      args,
    );
  }
  const parsed = definition.args.map((validator, i) =>
    validator.parse(args[i], `${module}.${name} argument ${i + 1}`),
  );
  return (definition.run as (...a: unknown[]) => unknown)(...parsed);
}

type EventSink = (event: string, payload: unknown) => void;
const sinks = new Set<EventSink>();

/**
 * Sends an event to the game (`game.platform.on(event, …)`).
 *
 * @example
 * ```ts
 * emitToGame('scores:updated', { best: 120 });
 * ```
 */
export function emitToGame(event: string, payload?: unknown): void {
  for (const sink of sinks) sink(event, payload);
}

/** @internal The app connects its windows here. */
export function addEventSink(sink: EventSink): () => void {
  sinks.add(sink);
  return () => sinks.delete(sink);
}
