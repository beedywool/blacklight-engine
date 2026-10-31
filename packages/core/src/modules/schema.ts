import { didYouMean } from '../suggest';

/**
 * A runtime type: checks an unknown value, fills in defaults and gives TypeScript the type of the
 * result. Module configurations (`defineModule({ config })`) and native function arguments
 * (`defineNative`) are described with schemas, so a wrong value is reported with its path and the
 * expected shape instead of failing later.
 *
 * `Out` is the checked value, `In` what the caller may write (optional keys, defaults).
 *
 * @example
 * ```ts
 * import { t } from '@blacklight/core';
 *
 * const options = t.object({
 *   file: t.string().default('game.db'),
 *   pageSize: t.number({ integer: true, min: 1 }).optional(),
 * });
 * options.parse({}); // { file: 'game.db', pageSize: undefined }
 * ```
 */
export interface Schema<Out, In = Out> {
  /** Short description used in error messages: `"a string"`, `"one of 'a' | 'b'"`. */
  readonly description: string;
  /**
   * Checks `value`, pushing one readable line per problem into `issues`. Returns the value with
   * defaults applied (meaningless when an issue was added).
   */
  check(value: unknown, path: string, issues: string[]): Out;
  /**
   * Returns the checked value or throws a {@link SchemaError} listing every problem.
   *
   * @param path - Name of the value in error messages, e.g. `"modules.sqlite"`.
   */
  parse(value: unknown, path?: string): Out;
  /** Accepts `undefined`. */
  optional(): Schema<Out | undefined, In | undefined>;
  /** Uses `value` when the input is `undefined`. */
  default(value: Out): Schema<Out, In | undefined>;
  /** @internal Type marker, never set. */
  readonly _input?: In;
}

/** The type a schema produces. */
export type Infer<S> = S extends Schema<infer Out, unknown> ? Out : never;
/** The type a schema accepts (keys with defaults are optional). */
export type InferInput<S> = S extends Schema<unknown, infer In> ? In : never;

/**
 * Thrown by {@link Schema.parse}. `issues` holds one line per problem.
 *
 * @example
 * ```ts
 * import { SchemaError, t } from '@blacklight/core';
 *
 * try {
 *   t.object({ port: t.number({ integer: true }) }).parse({ port: 'x' });
 * } catch (error) {
 *   if (error instanceof SchemaError) console.error(error.issues); // ['`port` must be an integer, got "x"']
 * }
 * ```
 */
export class SchemaError extends Error {
  constructor(
    /** One line per problem, with the path of the value and what was expected. */
    readonly issues: string[],
  ) {
    super(issues.join('\n'));
    this.name = 'SchemaError';
  }
}

function show(value: unknown): string {
  if (value === undefined) return 'nothing';
  if (typeof value === 'string')
    return JSON.stringify(value.length > 40 ? `${value.slice(0, 40)}…` : value);
  if (Array.isArray(value)) return 'an array';
  if (value === null) return 'null';
  if (typeof value === 'object') return 'an object';
  return String(value);
}

function label(path: string): string {
  return path ? `\`${path}\`` : 'the value';
}

function make<Out, In>(
  description: string,
  check: (value: unknown, path: string, issues: string[]) => Out,
): Schema<Out, In> {
  const schema: Schema<Out, In> = {
    description,
    check,
    parse(value, path = '') {
      const issues: string[] = [];
      const result = check(value, path, issues);
      if (issues.length > 0) throw new SchemaError(issues);
      return result;
    },
    optional() {
      return make<Out | undefined, In | undefined>(`${description} (optional)`, (v, p, i) =>
        v === undefined ? undefined : check(v, p, i),
      );
    },
    default(fallback) {
      return make<Out, In | undefined>(description, (v, p, i) =>
        v === undefined ? structuredClone(fallback) : check(v, p, i),
      );
    },
  };
  return schema;
}

function expect<T>(
  description: string,
  test: (value: unknown) => boolean,
): (value: unknown, path: string, issues: string[]) => T {
  return (value, path, issues) => {
    if (!test(value)) issues.push(`${label(path)} must be ${description}, got ${show(value)}`);
    return value as T;
  };
}

/** Options of {@link t.string}. */
export interface StringOptions {
  /** Minimum length. */
  min?: number;
  /** Maximum length. */
  max?: number;
  /** Regular expression the whole string must match. */
  pattern?: RegExp;
  /** Must be an absolute `http:` or `https:` URL. */
  url?: boolean;
}

/** Options of {@link t.number}. */
export interface NumberOptions {
  /** Smallest accepted value (included). */
  min?: number;
  /** Largest accepted value (included). */
  max?: number;
  /** Only whole numbers are accepted. */
  integer?: boolean;
}

type Shape = Record<string, Schema<unknown, unknown>>;
type Simplify<T> = { [K in keyof T]: T[K] } & {};
type OptionalKeys<S extends Shape> = {
  [K in keyof S]: undefined extends InferInput<S[K]> ? K : never;
}[keyof S];
/** Value type of an object schema. */
export type ObjectOutput<S extends Shape> = Simplify<{ [K in keyof S]: Infer<S[K]> }>;
/** Input type of an object schema: keys that accept `undefined` are optional. */
export type ObjectInput<S extends Shape> = Simplify<
  { [K in Exclude<keyof S, OptionalKeys<S>>]: InferInput<S[K]> } & {
    [K in OptionalKeys<S>]?: InferInput<S[K]>;
  }
>;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/**
 * Schema builders.
 *
 * @example
 * ```ts
 * const config = t.object({
 *   endpoint: t.string({ url: true }),
 *   retries: t.number({ integer: true, min: 0 }).default(5),
 *   mode: t.enum(['fast', 'safe']).default('safe'),
 * });
 * type Config = Infer<typeof config>;
 * ```
 */
export const t = {
  /** A string, optionally with a length, a pattern or an http(s) URL. */
  string(options: StringOptions = {}): Schema<string> {
    const parts = ['a string'];
    if (options.url) parts.push('holding an http(s) URL');
    if (options.min !== undefined) parts.push(`of at least ${options.min} characters`);
    if (options.max !== undefined) parts.push(`of at most ${options.max} characters`);
    if (options.pattern) parts.push(`matching ${options.pattern}`);
    const description = parts.join(' ');
    return make(description, (value, path, issues) => {
      const ok =
        typeof value === 'string' &&
        (options.min === undefined || value.length >= options.min) &&
        (options.max === undefined || value.length <= options.max) &&
        (!options.pattern || options.pattern.test(value)) &&
        (!options.url || /^https?:\/\/[^\s]+$/.test(value));
      if (!ok) issues.push(`${label(path)} must be ${description}, got ${show(value)}`);
      return value as string;
    });
  },

  /** A finite number, optionally an integer within bounds. */
  number(options: NumberOptions = {}): Schema<number> {
    const parts = [options.integer ? 'an integer' : 'a number'];
    if (options.min !== undefined) parts.push(`>= ${options.min}`);
    if (options.max !== undefined) parts.push(`<= ${options.max}`);
    const description = parts.join(' ');
    return make(
      description,
      expect(
        description,
        (v) =>
          typeof v === 'number' &&
          Number.isFinite(v) &&
          (!options.integer || Number.isInteger(v)) &&
          (options.min === undefined || v >= options.min) &&
          (options.max === undefined || v <= options.max),
      ),
    );
  },

  /** `true` or `false`. */
  boolean(): Schema<boolean> {
    return make(
      'a boolean',
      expect('a boolean', (v) => typeof v === 'boolean'),
    );
  },

  /** One of the listed strings or numbers. */
  enum<const V extends readonly (string | number)[]>(values: V): Schema<V[number]> {
    const description = `one of ${values.map((v) => JSON.stringify(v)).join(' | ')}`;
    return make(description, (value, path, issues) => {
      if (!values.includes(value as V[number])) {
        const hint =
          typeof value === 'string'
            ? didYouMean(
                value,
                values.filter((v): v is string => typeof v === 'string'),
              )
            : '';
        issues.push(`${label(path)} must be ${description}, got ${show(value)}.${hint}`);
      }
      return value as V[number];
    });
  },

  /** Any value; use for data checked elsewhere. */
  unknown(): Schema<unknown> {
    return make('any value', (value) => value);
  },

  /** Binary data. */
  bytes(): Schema<Uint8Array> {
    return make(
      'a Uint8Array',
      expect('a Uint8Array', (v) => v instanceof Uint8Array),
    );
  },

  /** A list whose items all match `item`. */
  array<Out, In>(item: Schema<Out, In>, options: { max?: number } = {}): Schema<Out[], In[]> {
    const description = `a list of ${item.description}`;
    return make(description, (value, path, issues) => {
      if (!Array.isArray(value)) {
        issues.push(`${label(path)} must be ${description}, got ${show(value)}`);
        return [];
      }
      if (options.max !== undefined && value.length > options.max) {
        issues.push(`${label(path)} must have at most ${options.max} items, got ${value.length}`);
      }
      return value.map((entry, i) => item.check(entry, `${path}[${i}]`, issues));
    });
  },

  /**
   * An object with known keys. Unknown keys are reported (with a suggestion), so a typo in a
   * configuration does not go unnoticed.
   */
  object<S extends Shape>(shape: S): Schema<ObjectOutput<S>, ObjectInput<S>> {
    const keys = Object.keys(shape);
    return make('an object', (value, path, issues) => {
      if (!isRecord(value)) {
        issues.push(`${label(path)} must be an object, got ${show(value)}`);
        return {} as ObjectOutput<S>;
      }
      const out: Record<string, unknown> = {};
      for (const key of keys) {
        out[key] = shape[key]!.check(value[key], path ? `${path}.${key}` : key, issues);
      }
      for (const key of Object.keys(value)) {
        if (!(key in shape)) {
          const where = path ? `\`${path}\`` : 'the object';
          issues.push(
            `${where} has an unknown option \`${key}\`.${didYouMean(key, keys)}${keys.length > 0 ? ` Known options: ${keys.join(', ')}.` : ''}`,
          );
        }
      }
      return out as ObjectOutput<S>;
    });
  },

  /** An object used as a map: any keys, values matching `value`. */
  record<Out, In>(value: Schema<Out, In>): Schema<Record<string, Out>, Record<string, In>> {
    const description = `an object of ${value.description}`;
    return make(description, (input, path, issues) => {
      if (!isRecord(input)) {
        issues.push(`${label(path)} must be ${description}, got ${show(input)}`);
        return {};
      }
      const out: Record<string, Out> = {};
      for (const [key, entry] of Object.entries(input)) {
        out[key] = value.check(entry, path ? `${path}.${key}` : key, issues);
      }
      return out;
    });
  },
};
