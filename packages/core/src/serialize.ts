import { GameObject } from './objects/game-object';
import { Vector2 } from './math';

/** JSON-safe value with references to game objects. */
export type Encoded = unknown;

function isPlain(value: object): boolean {
  const proto = Object.getPrototypeOf(value);
  return proto === Object.prototype || proto === null;
}

/**
 * Encodes a value for a snapshot: numbers, strings, booleans, null, plain objects, arrays, Maps,
 * Sets and `Vector2` are copied; game objects become `{ $ref: id }`; everything else (functions,
 * display objects, class instances) is left out and returns `undefined`.
 */
export function encode(value: unknown, depth = 0): Encoded {
  if (depth > 32) return undefined;
  if (
    value === null ||
    typeof value === 'number' ||
    typeof value === 'string' ||
    typeof value === 'boolean'
  )
    return value;
  if (typeof value !== 'object') return undefined;
  if (value instanceof GameObject) return { $ref: value.id };
  if (value instanceof Vector2) return { $v: [value.x, value.y] };
  if (Array.isArray(value)) return value.map((item) => encode(item, depth + 1) ?? null);
  if (value instanceof Map)
    return { $map: [...value].map(([k, v]) => [encode(k, depth + 1), encode(v, depth + 1)]) };
  if (value instanceof Set) return { $set: [...value].map((v) => encode(v, depth + 1)) };
  if (!isPlain(value)) return undefined;
  const out: Record<string, Encoded> = {};
  for (const [key, item] of Object.entries(value)) {
    const encoded = encode(item, depth + 1);
    if (encoded !== undefined) out[key] = encoded;
  }
  return out;
}

/** Reverses {@link encode}; `lookup` resolves object references. */
export function decode(value: Encoded, lookup: (id: number) => GameObject | undefined): unknown {
  if (value === null || typeof value !== 'object') return value;
  if (Array.isArray(value)) return value.map((item) => decode(item, lookup));
  const record = value as Record<string, unknown>;
  if ('$undefined' in record) return undefined;
  if ('$ref' in record) return lookup(record.$ref as number);
  if ('$v' in record) {
    const [x, y] = record.$v as [number, number];
    return new Vector2(x, y);
  }
  if ('$map' in record)
    return new Map(
      (record.$map as [Encoded, Encoded][]).map(([k, v]) => [decode(k, lookup), decode(v, lookup)]),
    );
  if ('$set' in record) return new Set((record.$set as Encoded[]).map((v) => decode(v, lookup)));
  const out: Record<string, unknown> = {};
  for (const [key, item] of Object.entries(record)) out[key] = decode(item, lookup);
  return out;
}

/** Data fields of an object or behavior: own enumerable fields minus `skip`. */
export function encodeFields(target: object, keys: Iterable<string>): Record<string, Encoded> {
  const out: Record<string, Encoded> = {};
  for (const key of keys) {
    const value = (target as Record<string, unknown>)[key];
    // Undefined is saved too, so restoring clears a value set after the snapshot.
    const encoded = value === undefined ? { $undefined: true } : encode(value);
    if (encoded !== undefined) out[key] = encoded;
  }
  return out;
}

/** Writes decoded fields back; existing `Vector2` fields are updated in place. */
export function applyFields(
  target: object,
  fields: Record<string, Encoded>,
  lookup: (id: number) => GameObject | undefined,
): void {
  const record = target as Record<string, unknown>;
  for (const [key, encoded] of Object.entries(fields)) {
    const value = decode(encoded, lookup);
    const current = record[key];
    if (current instanceof Vector2 && value instanceof Vector2) current.copy(value);
    else record[key] = value;
  }
}
