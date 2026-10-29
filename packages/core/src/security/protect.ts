// Protected values (SEC-05). A protected property becomes an accessor that keeps the value, a
// masked copy (XOR with per-value random bits) and a checksum of the masked copy. A memory editor
// that changes the plain value no longer matches the masked copy; one that finds and changes the
// masked copy breaks its checksum. Either way the authentic copy is known and the other one can
// be restored.

/** Reports a mismatch; `restore()` puts the authentic value back. */
export type TamperReport = (info: { expected: unknown; found: unknown; restore(): void }) => void;

/** A watched property. */
export interface ProtectedValue {
  /** Compares the copies; reports and returns `false` on a mismatch. */
  verify(): boolean;
}

const encoder = new TextEncoder();
const decoder = new TextDecoder();
const float = new Float64Array(1);
const words = new Uint32Array(float.buffer);

function randomWord(): number {
  return crypto.getRandomValues(new Uint32Array(1))[0]! | 1;
}

function checksum(values: ArrayLike<number>, salt: number): number {
  // FNV-1a over 32-bit words, salted so equal values have different checksums.
  let hash = 0x811c9dc5 ^ salt;
  for (let i = 0; i < values.length; i++) hash = Math.imul(hash ^ values[i]!, 0x01000193);
  return hash >>> 0;
}

/** Masked form of a value: numbers as their 64 bits, anything else as JSON bytes. */
interface Masked {
  number: boolean;
  data: Uint32Array;
  mask: Uint32Array;
  sum: number;
}

function mask(value: unknown): Masked {
  let raw: Uint32Array;
  const number = typeof value === 'number';
  if (number) {
    float[0] = value;
    raw = new Uint32Array(words);
  } else {
    const bytes = encoder.encode(value === undefined ? 'u' : `j${JSON.stringify(value)}`);
    raw = Uint32Array.from(bytes);
  }
  const keys = Uint32Array.from(raw, () => randomWord());
  const data = raw.map((word, i) => word ^ keys[i]!);
  return { number, data, mask: keys, sum: checksum(data, keys[0] ?? 0) };
}

function unmask(masked: Masked): unknown {
  const raw = masked.data.map((word, i) => word ^ masked.mask[i]!);
  if (masked.number) {
    words.set(raw);
    return float[0];
  }
  const text = decoder.decode(Uint8Array.from(raw));
  return text === 'u' ? undefined : (JSON.parse(text.slice(1)) as unknown);
}

function same(a: unknown, b: unknown): boolean {
  return Object.is(a, b) || (typeof a === 'object' && JSON.stringify(a) === JSON.stringify(b));
}

/**
 * Turns `target[key]` into a protected value. Reading it verifies the copies first. Works for
 * numbers, strings, booleans and small JSON values replaced as a whole (`hp = 10`, not `stats.hp++`
 * on a protected object).
 *
 * @example
 * ```ts
 * const watch = protect(player, 'hp', ({ restore }) => restore());
 * player.hp -= 10; // fine: goes through the setter
 * watch.verify(); // true
 * ```
 */
export function protect(target: object, key: string, report: TamperReport): ProtectedValue {
  const record = target as Record<string, unknown>;
  let plain: unknown = record[key];
  let masked: Masked = mask(plain);
  // A mismatch the handler chose not to fix is reported once, not on every read.
  let reported = false;
  const store = (value: unknown) => {
    plain = value;
    masked = mask(value);
    reported = false;
  };
  const mismatch = (info: Parameters<TamperReport>[0]): false => {
    if (!reported) {
      reported = true;
      report(info);
    }
    return false;
  };
  const verify = (): boolean => {
    if (checksum(masked.data, masked.mask[0] ?? 0) !== masked.sum) {
      // The masked copy was edited: the plain value is the authentic one.
      const authentic = plain;
      return mismatch({ expected: authentic, found: undefined, restore: () => store(authentic) });
    }
    const authentic = unmask(masked);
    if (same(authentic, plain)) return true;
    return mismatch({ expected: authentic, found: plain, restore: () => store(authentic) });
  };
  Object.defineProperty(target, key, {
    configurable: true,
    enumerable: true,
    get() {
      verify();
      return plain;
    },
    set(value: unknown) {
      store(value);
    },
  });
  const handle: ProtectedValue & { poke(value: unknown): void; pokeMasked(): void } = {
    verify,
    // Test hooks: simulate a memory editor changing one copy without going through the setter.
    poke(value) {
      plain = value;
    },
    pokeMasked() {
      masked.data[0] = masked.data[0]! ^ 0xffff;
    },
  };
  return handle;
}
