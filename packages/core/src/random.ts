function hashSeed(seed: string | number): number {
  const text = String(seed);
  let hash = 2166136261;
  for (let i = 0; i < text.length; i++) {
    hash ^= text.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

/**
 * Seeded random number generator (sfc32). The same seed gives the same sequence on every
 * platform, which rollback netcode and replays depend on; `state` can be saved and restored.
 *
 * @example
 * ```ts
 * const random = new Random('level-3');
 * random.int(1, 6);          // dice roll
 * random.pick(['a', 'b']);   // random element
 * ```
 */
export class Random {
  private a = 0;
  private b = 0;
  private c = 0;
  private d = 0;

  constructor(seed: string | number = Date.now()) {
    this.seed(seed);
  }

  /** Restarts the sequence from `seed`. */
  seed(seed: string | number): void {
    const h = hashSeed(seed);
    this.a = 0x9e3779b9;
    this.b = 0x243f6a88;
    this.c = 0xb7e15162;
    this.d = h;
    for (let i = 0; i < 15; i++) this.next();
  }

  /** Float in [0, 1). */
  next(): number {
    this.a |= 0;
    this.b |= 0;
    this.c |= 0;
    this.d |= 0;
    const t = (((this.a + this.b) | 0) + this.d) | 0;
    this.d = (this.d + 1) | 0;
    this.a = this.b ^ (this.b >>> 9);
    this.b = (this.c + (this.c << 3)) | 0;
    this.c = (this.c << 21) | (this.c >>> 11);
    this.c = (this.c + t) | 0;
    return (t >>> 0) / 4294967296;
  }

  /** Float in [min, max). */
  float(min = 0, max = 1): number {
    return min + this.next() * (max - min);
  }

  /** Integer in [min, max], both included. */
  int(min: number, max: number): number {
    return Math.floor(this.float(Math.ceil(min), Math.floor(max) + 1));
  }

  /** `true` with the given probability (0 to 1). */
  chance(probability = 0.5): boolean {
    return this.next() < probability;
  }

  /** Random element of a non-empty array. */
  pick<T>(items: readonly T[]): T {
    if (items.length === 0) throw new RangeError('Random.pick needs at least one item.');
    return items[Math.floor(this.next() * items.length)]!;
  }

  /** Shuffles a copy of `items` (Fisher–Yates). */
  shuffle<T>(items: readonly T[]): T[] {
    const copy = [...items];
    for (let i = copy.length - 1; i > 0; i--) {
      const j = Math.floor(this.next() * (i + 1));
      [copy[i], copy[j]] = [copy[j]!, copy[i]!];
    }
    return copy;
  }

  /** Internal state, to save with a snapshot. */
  get state(): [number, number, number, number] {
    return [this.a, this.b, this.c, this.d];
  }

  set state(value: [number, number, number, number]) {
    [this.a, this.b, this.c, this.d] = value;
  }
}
