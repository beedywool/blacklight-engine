import { describe, expect, it } from 'vitest';
import { DMath } from '../src/dmath';
import { Random } from '../src/random';

/** Distance between two doubles in units of the last place of `expected`. */
function ulps(actual: number, expected: number): number {
  if (Object.is(actual, expected) || (Number.isNaN(actual) && Number.isNaN(expected))) return 0;
  const unit = Math.max(Number.EPSILON * Math.abs(expected), Number.MIN_VALUE);
  return Math.abs(actual - expected) / unit;
}

function worst(
  f: (x: number) => number,
  g: (x: number) => number,
  sample: (r: Random) => number,
): number {
  const random = new Random('dmath');
  let max = 0;
  for (let i = 0; i < 20_000; i++) {
    const x = sample(random);
    max = Math.max(max, ulps(f(x), g(x)));
  }
  return max;
}

/** FNV-1a over the bits of every result: one number that changes when any bit does. */
function fingerprint(values: number[]): string {
  const view = new DataView(new ArrayBuffer(8));
  let hash = 0x811c9dc5;
  for (const v of values) {
    view.setFloat64(0, v);
    for (let i = 0; i < 8; i++) hash = Math.imul(hash ^ view.getUint8(i), 16777619);
  }
  return (hash >>> 0).toString(16);
}

describe('DMath', () => {
  it('stays within a few ulps of Math', () => {
    const range = (lo: number, hi: number) => (r: Random) => r.float(lo, hi);
    expect(worst(DMath.sin, Math.sin, range(-100, 100))).toBeLessThanOrEqual(2);
    expect(worst(DMath.cos, Math.cos, range(-100, 100))).toBeLessThanOrEqual(2);
    expect(worst(DMath.tan, Math.tan, range(-1.5, 1.5))).toBeLessThanOrEqual(3);
    expect(worst(DMath.atan, Math.atan, range(-50, 50))).toBeLessThanOrEqual(2);
    expect(worst(DMath.asin, Math.asin, range(-1, 1))).toBeLessThanOrEqual(3);
    expect(worst(DMath.acos, Math.acos, range(-1, 1))).toBeLessThanOrEqual(3);
    expect(worst(DMath.exp, Math.exp, range(-700, 700))).toBeLessThanOrEqual(2);
    expect(worst(DMath.log, Math.log, (r) => DMath.exp(r.float(-700, 700)))).toBeLessThanOrEqual(2);
    expect(worst(DMath.log2, Math.log2, range(1e-6, 1e6))).toBeLessThanOrEqual(2);
    expect(worst(DMath.log10, Math.log10, range(1e-6, 1e6))).toBeLessThanOrEqual(2);
    expect(worst(DMath.cbrt, Math.cbrt, range(-1e6, 1e6))).toBeLessThanOrEqual(2);
    const random = new Random('pairs');
    let atan2 = 0;
    let pow = 0;
    let hypot = 0;
    for (let i = 0; i < 20_000; i++) {
      const a = random.float(-200, 200);
      const b = random.float(-200, 200);
      atan2 = Math.max(atan2, ulps(DMath.atan2(a, b), Math.atan2(a, b)));
      hypot = Math.max(hypot, ulps(DMath.hypot(a, b), Math.hypot(a, b)));
      const base = random.float(0, 100);
      const exponent = random.float(-10, 10);
      pow = Math.max(pow, ulps(DMath.pow(base, exponent), Math.pow(base, exponent)));
    }
    expect(atan2).toBeLessThanOrEqual(2);
    expect(hypot).toBeLessThanOrEqual(2);
    expect(pow).toBeLessThanOrEqual(8);
  });

  it('handles the special values like Math', () => {
    const cases: [string, number[]][] = [
      ['sin', [0, -0, Infinity, NaN, Math.PI / 2]],
      ['cos', [0, Infinity, NaN, Math.PI]],
      ['atan', [Infinity, -Infinity, 0, -0]],
      ['exp', [Infinity, -Infinity, 0, 1000, -1000]],
      ['log', [0, -1, Infinity, 1, 5e-324]],
      ['log2', [8, 1024, 0.5, 0]],
      ['cbrt', [27, -8, 0, Infinity]],
    ];
    for (const [name, inputs] of cases) {
      const f = DMath[name as 'sin'];
      const g = Math[name as 'sin'];
      for (const x of inputs) expect(ulps(f(x), g(x)), `${name}(${x})`).toBeLessThanOrEqual(1);
    }
    const pairs: [number, number][] = [
      [0, 0],
      [-0, 0],
      [0, -0],
      [-0, -0],
      [1, 0],
      [-1, 0],
      [0, -1],
      [Infinity, Infinity],
      [-Infinity, -Infinity],
      [1, -Infinity],
      [-1, -Infinity],
      [NaN, 1],
    ];
    for (const [y, x] of pairs) expect(DMath.atan2(y, x)).toBe(Math.atan2(y, x));
    const powers: [number, number][] = [
      [2, 10],
      [2, 0.5],
      [-2, 3],
      [-2, 0.5],
      [0, -1],
      [-0, -3],
      [Infinity, -1],
      [-Infinity, 3],
      [1, Infinity],
      [0.5, -Infinity],
      [NaN, 0],
      [10, 400],
    ];
    for (const [x, y] of powers) expect(DMath.pow(x, y)).toBe(Math.pow(x, y));
    // Large results lose a few more bits than Math.pow (documented accuracy: 1e-14 relative).
    expect(ulps(DMath.pow(10, 308), 1e308)).toBeLessThanOrEqual(64);
    expect(DMath.hypot(3, 4)).toBe(5);
    expect(DMath.hypot()).toBe(0);
    expect(DMath.hypot(NaN, Infinity)).toBe(Infinity);
  });

  it('gives the same bits as on every engine (golden fingerprint)', () => {
    // Recomputed on JavaScriptCore by e2e/net.spec.ts; a change here means the algorithms changed.
    const random = new Random('fingerprint');
    const values: number[] = [];
    for (let i = 0; i < 2000; i++) {
      const x = random.float(-1000, 1000);
      const y = random.float(-1000, 1000);
      values.push(
        DMath.sin(x),
        DMath.cos(x),
        DMath.tan(x),
        DMath.atan2(y, x),
        DMath.exp(x / 100),
        DMath.log(Math.abs(x)),
        DMath.pow(Math.abs(x) / 100, y / 500),
        DMath.hypot(x, y),
        DMath.asin(x / 1000),
        DMath.cbrt(x),
      );
    }
    expect(fingerprint(values)).toBe(GOLDEN);
  });
});

const GOLDEN = 'a2aa0e85';
