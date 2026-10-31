/**
 * 32-bit FNV-1a hash of a string (UTF-16 code units). Number-to-text conversion is exactly
 * specified in JavaScript, so the same state serializes and hashes the same on every engine.
 *
 * @example
 * ```ts
 * checksum(JSON.stringify(state)); // 0x3f2a91c4
 * ```
 */
export function checksum(text: string): number {
  let hash = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    hash ^= text.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

/**
 * `JSON.stringify` with object keys sorted: two equal states give the same text even when their
 * fields were created in another order (an object re-created by a rollback).
 *
 * @example
 * ```ts
 * stableStringify({ b: 1, a: [{ d: 2, c: 3 }] }); // '{"a":[{"c":3,"d":2}],"b":1}'
 * ```
 */
export function stableStringify(value: unknown): string {
  return JSON.stringify(value, (_key, v: unknown) =>
    isRecord(v)
      ? Object.fromEntries(
          Object.keys(v)
            .sort()
            .map((k) => [k, v[k]]),
        )
      : v,
  );
}

/** One value that differs between two states. */
export interface StateDifference {
  /** Where, e.g. `objects[id=4].core.x` or `random[2]`. */
  path: string;
  /** The value on this machine. */
  local: unknown;
  /** The value on the other member's machine. */
  remote: unknown;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/** Arrays of objects with an `id` (scene objects) are matched by id rather than by position. */
function byId(list: unknown[]): Map<unknown, unknown> | undefined {
  if (list.length === 0 || !list.every((item) => isRecord(item) && 'id' in item)) return undefined;
  return new Map(list.map((item) => [(item as { id: unknown }).id, item]));
}

/**
 * Differences between two JSON states, at most `limit` of them: the desync report. Scene
 * objects are matched by id, so a missing object shows as one difference.
 *
 * @example
 * ```ts
 * diffStates(JSON.parse(mine), JSON.parse(theirs));
 * // [{ path: 'objects[id=3].core.x', local: 120.5, remote: 120.50000000000001 }]
 * ```
 */
export function diffStates(local: unknown, remote: unknown, limit = 50): StateDifference[] {
  const out: StateDifference[] = [];
  const walk = (a: unknown, b: unknown, path: string) => {
    if (out.length >= limit) return;
    if (Object.is(a, b)) return;
    if (Array.isArray(a) && Array.isArray(b)) {
      const ma = byId(a);
      const mb = byId(b);
      if (ma && mb) {
        for (const [id, item] of ma) walk(item, mb.get(id), `${path}[id=${String(id)}]`);
        for (const [id, item] of mb)
          if (!ma.has(id)) walk(undefined, item, `${path}[id=${String(id)}]`);
        return;
      }
      const length = Math.max(a.length, b.length);
      for (let i = 0; i < length; i++) walk(a[i], b[i], `${path}[${i}]`);
      return;
    }
    if (isRecord(a) && isRecord(b)) {
      const keys = new Set([...Object.keys(a), ...Object.keys(b)]);
      for (const key of keys) walk(a[key], b[key], path ? `${path}.${key}` : key);
      return;
    }
    out.push({ path: path || '(root)', local: a, remote: b });
  };
  walk(local, remote, '');
  return out;
}
