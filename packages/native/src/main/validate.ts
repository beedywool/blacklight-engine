// Argument validation for everything that crosses the IPC bridge. The page is treated as
// untrusted: every argument is checked against a declared shape before a handler sees it.

/** Checks one value and returns it typed, or throws a {@link ValidationError}. */
export interface Validator<T> {
  /** Human-readable shape, used in error messages. */
  readonly description: string;
  parse(value: unknown, path: string): T;
}

/** The type a validator produces. */
export type Infer<V> = V extends Validator<infer T> ? T : never;

/** Types of a tuple of validators. */
export type InferArgs<A extends readonly Validator<unknown>[]> = {
  -readonly [K in keyof A]: Infer<A[K]>;
};

/** JSON-compatible value (what `v.json()` accepts). */
export type JsonValue =
  string | number | boolean | null | JsonValue[] | { [key: string]: JsonValue };

/** An argument from the page does not have the declared shape. */
export class ValidationError extends Error {
  constructor(path: string, expected: string, value: unknown) {
    super(`${path} must be ${expected}, got ${describeValue(value)}`);
    this.name = 'ValidationError';
  }
}

function describeValue(value: unknown): string {
  if (value === null) return 'null';
  if (Array.isArray(value)) return `an array of ${value.length}`;
  if (value instanceof Uint8Array) return `${value.length} bytes`;
  if (typeof value === 'string') return `a string of ${value.length} characters`;
  return typeof value === 'object' ? 'an object' : `${typeof value} ${String(value)}`;
}

function make<T>(description: string, check: (value: unknown, path: string) => T): Validator<T> {
  return { description, parse: check };
}

const DEFAULT_MAX_STRING = 10_000;
const DEFAULT_MAX_ITEMS = 10_000;
const DEFAULT_MAX_BYTES = 64 * 1024 * 1024;

/**
 * Validators for native function arguments.
 *
 * @example
 * ```ts
 * registerNative('scores', {
 *   submit: method([v.string({ max: 32 }), v.integer({ min: 0 })], (name, points) => db.add(name, points)),
 * });
 * ```
 */
export const v = {
  string(options: { max?: number; min?: number; pattern?: RegExp } = {}): Validator<string> {
    const max = options.max ?? DEFAULT_MAX_STRING;
    const min = options.min ?? 0;
    const description = `a string of ${min}–${max} characters${options.pattern ? ` matching ${options.pattern}` : ''}`;
    return make(description, (value, path) => {
      if (
        typeof value !== 'string' ||
        value.length > max ||
        value.length < min ||
        (options.pattern && !options.pattern.test(value))
      ) {
        throw new ValidationError(path, description, value);
      }
      return value;
    });
  },

  number(options: { min?: number; max?: number; integer?: boolean } = {}): Validator<number> {
    const min = options.min ?? -Number.MAX_VALUE;
    const max = options.max ?? Number.MAX_VALUE;
    const description = `a${options.integer ? 'n integer' : ' finite number'}${
      options.min !== undefined || options.max !== undefined ? ` from ${min} to ${max}` : ''
    }`;
    return make(description, (value, path) => {
      if (
        typeof value !== 'number' ||
        !Number.isFinite(value) ||
        value < min ||
        value > max ||
        (options.integer && !Number.isInteger(value))
      ) {
        throw new ValidationError(path, description, value);
      }
      return value;
    });
  },

  integer(options: { min?: number; max?: number } = {}): Validator<number> {
    return v.number({ ...options, integer: true });
  },

  boolean(): Validator<boolean> {
    return make('a boolean', (value, path) => {
      if (typeof value !== 'boolean') throw new ValidationError(path, 'a boolean', value);
      return value;
    });
  },

  /** One of the given values. */
  literal<const T extends string | number | boolean>(...values: T[]): Validator<T> {
    const description = `one of ${values.map((x) => JSON.stringify(x)).join(', ')}`;
    return make(description, (value, path) => {
      if (!values.includes(value as T)) throw new ValidationError(path, description, value);
      return value as T;
    });
  },

  /** Binary data (`Uint8Array`, as the structured clone of the IPC channel delivers it). */
  bytes(options: { max?: number } = {}): Validator<Uint8Array> {
    const max = options.max ?? DEFAULT_MAX_BYTES;
    const description = `a Uint8Array of at most ${max} bytes`;
    return make(description, (value, path) => {
      if (!(value instanceof Uint8Array) || value.length > max) {
        throw new ValidationError(path, description, value);
      }
      return value;
    });
  },

  array<T>(item: Validator<T>, options: { max?: number } = {}): Validator<T[]> {
    const max = options.max ?? DEFAULT_MAX_ITEMS;
    const description = `an array of at most ${max} × ${item.description}`;
    return make(description, (value, path) => {
      if (!Array.isArray(value) || value.length > max) {
        throw new ValidationError(path, description, value);
      }
      return value.map((x, i) => item.parse(x, `${path}[${i}]`));
    });
  },

  /** A plain object with exactly these keys (missing optional keys allowed, unknown keys refused). */
  object<S extends Record<string, Validator<unknown>>>(
    shape: S,
  ): Validator<{ [K in keyof S]: Infer<S[K]> }> {
    const keys = Object.keys(shape);
    const description = `an object { ${keys.join(', ')} }`;
    return make(description, (value, path) => {
      if (
        typeof value !== 'object' ||
        value === null ||
        Array.isArray(value) ||
        Object.getPrototypeOf(value) !== Object.prototype
      ) {
        throw new ValidationError(path, description, value);
      }
      const record = value as Record<string, unknown>;
      for (const key of Object.keys(record)) {
        if (!Object.hasOwn(shape, key)) {
          throw new ValidationError(
            `${path}.${key}`,
            `absent (known: ${keys.join(', ')})`,
            record[key],
          );
        }
      }
      const out: Record<string, unknown> = {};
      for (const key of keys) {
        const parsed = shape[key]!.parse(record[key], `${path}.${key}`);
        if (parsed !== undefined) out[key] = parsed;
      }
      return out as { [K in keyof S]: Infer<S[K]> };
    });
  },

  optional<T>(inner: Validator<T>): Validator<T | undefined> {
    return make(`${inner.description} or undefined`, (value, path) =>
      value === undefined ? undefined : inner.parse(value, path),
    );
  },

  /** Any JSON value up to `maxBytes` once serialized. */
  json(options: { maxBytes?: number } = {}): Validator<JsonValue> {
    const max = options.maxBytes ?? 1024 * 1024;
    const description = `a JSON value of at most ${max} bytes`;
    return make(description, (value, path) => {
      let text: string | undefined;
      try {
        text = JSON.stringify(value);
      } catch {
        text = undefined;
      }
      if (text === undefined || text.length > max) {
        throw new ValidationError(path, description, value);
      }
      return JSON.parse(text) as JsonValue;
    });
  },
};
