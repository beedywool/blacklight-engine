// Deterministic math (NET-03, limitation L2). ECMAScript lets engines approximate `Math.sin`,
// `Math.exp`, `Math.pow`… as they like, and V8 and JavaScriptCore do return different last bits.
// These versions use only +, −, ×, ÷ and Math.sqrt, which IEEE 754 defines exactly (correctly
// rounded), and JavaScript forbids fused or extended-precision arithmetic: the same inputs give
// the same bits on every engine. Algorithms and coefficients come from fdlibm (Sun, freely
// redistributable), the library most engines started from.

const bits = new DataView(new ArrayBuffer(8));

function highWord(x: number): number {
  bits.setFloat64(0, x);
  return bits.getInt32(0);
}

function lowWord(x: number): number {
  bits.setFloat64(0, x);
  return bits.getUint32(4);
}

function fromWords(high: number, low: number): number {
  bits.setInt32(0, high);
  bits.setUint32(4, low >>> 0);
  return bits.getFloat64(0);
}

/** 2^k for an integer k in [-1022, 1023], built from its bits. */
function pow2(k: number): number {
  return fromWords((k + 1023) << 20, 0);
}

/** x × 2^k for any integer k, in steps that stay in range. */
function scale(x: number, k: number): number {
  while (k > 1023) {
    x *= pow2(1023);
    k -= 1023;
  }
  while (k < -1022) {
    x *= pow2(-1022);
    k += 1022;
  }
  return x * pow2(k);
}

const PI = 3.141592653589793;
const PI_LO = 1.2246467991473532e-16;
const PIO2 = 1.5707963267948966;
const PIO4 = 0.7853981633974483;

// π/2 split in 33-bit pieces: n × piece is exact for |n| < 2^20.
const INV_PIO2 = 6.36619772367581382433e-1;
const PIO2_1 = 1.57079632673412561417;
const PIO2_2 = 6.0771005063039659766e-11;
const PIO2_2T = 2.02226624879595063154e-21;

const S1 = -1.66666666666666324348e-1;
const S2 = 8.33333333332248946124e-3;
const S3 = -1.98412698298579493134e-4;
const S4 = 2.75573137070700676789e-6;
const S5 = -2.50507602534068634195e-8;
const S6 = 1.58969099521155010221e-10;

const C1 = 4.16666666666666019037e-2;
const C2 = -1.38888888888741095749e-3;
const C3 = 2.48015872894767294178e-5;
const C4 = -2.75573143513906633035e-7;
const C5 = 2.0875723212981748279e-9;
const C6 = -1.13596475577881948265e-11;

/** sin on [-π/4, π/4]. */
function kernelSin(x: number): number {
  const z = x * x;
  const v = z * x;
  const r = S2 + z * (S3 + z * (S4 + z * (S5 + z * S6)));
  return x + v * (S1 + z * r);
}

/** cos on [-π/4, π/4]. */
function kernelCos(x: number): number {
  const z = x * x;
  const r = z * (C1 + z * (C2 + z * (C3 + z * (C4 + z * (C5 + z * C6)))));
  const hz = 0.5 * z;
  const w = 1 - hz;
  return w + (1 - w - hz + z * r);
}

/** Quadrant (0–3) and remainder in [-π/4, π/4] of x. */
function reduce(x: number): [quadrant: number, rest: number] {
  if (Math.abs(x) <= PIO4) return [0, x];
  const n = Math.round(x * INV_PIO2);
  const rest = x - n * PIO2_1 - n * PIO2_2 - n * PIO2_2T;
  return [n - 4 * Math.floor(n / 4), rest];
}

function sin(x: number): number {
  if (!Number.isFinite(x)) return NaN;
  if (Math.abs(x) < 3.725290298461914e-9) return x;
  const [q, r] = reduce(x);
  switch (q) {
    case 0:
      return kernelSin(r);
    case 1:
      return kernelCos(r);
    case 2:
      return -kernelSin(r);
    default:
      return -kernelCos(r);
  }
}

function cos(x: number): number {
  if (!Number.isFinite(x)) return NaN;
  if (Math.abs(x) < 3.725290298461914e-9) return 1;
  const [q, r] = reduce(x);
  switch (q) {
    case 0:
      return kernelCos(r);
    case 1:
      return -kernelSin(r);
    case 2:
      return -kernelCos(r);
    default:
      return kernelSin(r);
  }
}

function tan(x: number): number {
  if (!Number.isFinite(x)) return NaN;
  if (Math.abs(x) < 3.725290298461914e-9) return x;
  const [q, r] = reduce(x);
  const s = kernelSin(r);
  const c = kernelCos(r);
  return q === 0 || q === 2 ? s / c : -c / s;
}

const ATAN_HI = [
  4.63647609000806093515e-1, 7.85398163397448278999e-1, 9.82793723247329054082e-1,
  1.570796326794896558,
];
const ATAN_LO = [
  2.26987774529616870924e-17, 3.06161699786838301793e-17, 1.39033110312309984516e-17,
  6.12323399573676603587e-17,
];
const AT0 = 3.33333333333329318027e-1;
const AT1 = -1.99999999998764832476e-1;
const AT2 = 1.42857142725034663711e-1;
const AT3 = -1.1111110405462355788e-1;
const AT4 = 9.09088713343650656196e-2;
const AT5 = -7.69187620504482999495e-2;
const AT6 = 6.66107313738753120669e-2;
const AT7 = -5.83357013379057348645e-2;
const AT8 = 4.97687799461593236017e-2;
const AT9 = -3.6531572744216915527e-2;
const AT10 = 1.62858201153657823623e-2;

function atan(x: number): number {
  if (Number.isNaN(x)) return NaN;
  const negative = x < 0;
  let a = Math.abs(x);
  if (a >= 7.378697629483821e19) return negative ? -PIO2 : PIO2;
  if (a < 3.725290298461914e-9) return x;
  let id: number;
  if (a < 0.4375) {
    id = -1;
  } else if (a < 1.1875) {
    if (a < 0.6875) {
      id = 0;
      a = (2 * a - 1) / (2 + a);
    } else {
      id = 1;
      a = (a - 1) / (a + 1);
    }
  } else if (a < 2.4375) {
    id = 2;
    a = (a - 1.5) / (1 + 1.5 * a);
  } else {
    id = 3;
    a = -1 / a;
  }
  const z = a * a;
  const w = z * z;
  const s1 = z * (AT0 + w * (AT2 + w * (AT4 + w * (AT6 + w * (AT8 + w * AT10)))));
  const s2 = w * (AT1 + w * (AT3 + w * (AT5 + w * (AT7 + w * AT9))));
  if (id < 0) {
    const result = a - a * (s1 + s2);
    return negative ? -result : result;
  }
  const result = ATAN_HI[id]! - (a * (s1 + s2) - ATAN_LO[id]! - a);
  return negative ? -result : result;
}

/** `true` for -0 and negative numbers. */
function signBit(x: number): boolean {
  return x < 0 || Object.is(x, -0);
}

function atan2(y: number, x: number): number {
  if (Number.isNaN(x) || Number.isNaN(y)) return NaN;
  if (x === 1) return atan(y);
  const m = (signBit(y) ? 1 : 0) + (signBit(x) ? 2 : 0);
  if (y === 0) return m === 0 || m === 1 ? y : m === 2 ? PI : -PI;
  if (x === 0) return y < 0 ? -PIO2 : PIO2;
  if (!Number.isFinite(x)) {
    if (!Number.isFinite(y)) return [PIO4, -PIO4, 3 * PIO4, -3 * PIO4][m]!;
    return [0, -0, PI, -PI][m]!;
  }
  if (!Number.isFinite(y)) return y < 0 ? -PIO2 : PIO2;
  const k = ((highWord(y) >> 20) & 0x7ff) - ((highWord(x) >> 20) & 0x7ff);
  let z: number;
  if (k > 60) z = PIO2 + 0.5 * PI_LO;
  else if (x < 0 && k < -60) z = 0;
  else z = atan(Math.abs(y / x));
  switch (m) {
    case 0:
      return z;
    case 1:
      return -z;
    case 2:
      return PI - (z - PI_LO);
    default:
      return z - PI_LO - PI;
  }
}

function asin(x: number): number {
  if (!(Math.abs(x) <= 1)) return NaN;
  return atan2(x, Math.sqrt((1 - x) * (1 + x)));
}

function acos(x: number): number {
  if (!(Math.abs(x) <= 1)) return NaN;
  return atan2(Math.sqrt((1 - x) * (1 + x)), x);
}

const LN2_HI = 6.9314718036912381649e-1;
const LN2_LO = 1.90821492927058770002e-10;
const INV_LN2 = 1.442695040888963387;
const P1 = 1.66666666666666019037e-1;
const P2 = -2.77777777770155933842e-3;
const P3 = 6.61375632143793436117e-5;
const P4 = -1.6533902205465251539e-6;
const P5 = 4.13813679705723846039e-8;

function exp(x: number): number {
  if (Number.isNaN(x)) return NaN;
  if (x > 709.782712893384) return Infinity;
  if (x < -745.1332191019411) return 0;
  if (Math.abs(x) < 3.725290298461914e-9) return 1 + x;
  const k = Math.trunc(x * INV_LN2 + (x < 0 ? -0.5 : 0.5));
  const hi = x - k * LN2_HI;
  const lo = k * LN2_LO;
  const r = hi - lo;
  const t = r * r;
  const c = r - t * (P1 + t * (P2 + t * (P3 + t * (P4 + t * P5))));
  const y = 1 - (lo - (r * c) / (2 - c) - hi);
  return k === 0 ? y : scale(y, k);
}

const LG1 = 6.66666666666673513e-1;
const LG2 = 3.999999999940941908e-1;
const LG3 = 2.857142874366239149e-1;
const LG4 = 2.222219843214978396e-1;
const LG5 = 1.818357216161805012e-1;
const LG6 = 1.531383769920937332e-1;
const LG7 = 1.479819860511658591e-1;

/**
 * ln(x) for a finite x > 0 as `big + small`: `big` is k·ln2 (exact), `small` the rest. pow keeps
 * the two parts apart to lose fewer bits.
 */
function logParts(x: number): [big: number, small: number] {
  let k = 0;
  let hx = highWord(x);
  if (hx < 0x00100000) {
    // Subnormal: scale into the normal range first.
    x *= 18014398509481984; // 2^54
    k -= 54;
    hx = highWord(x);
  }
  k += (hx >> 20) - 1023;
  hx &= 0x000fffff;
  // Normalize the mantissa into [√2/2, √2) so the series converges fast.
  const i = (hx + 0x95f64) & 0x100000;
  const m = fromWords(hx | (i ^ 0x3ff00000), lowWord(x));
  k += i >> 20;
  const f = m - 1;
  const s = f / (2 + f);
  const z = s * s;
  const w = z * z;
  const t1 = w * (LG2 + w * (LG4 + w * LG6));
  const t2 = z * (LG1 + w * (LG3 + w * (LG5 + w * LG7)));
  const r = t2 + t1;
  const hfsq = 0.5 * f * f;
  return [k * LN2_HI, f - (hfsq - (s * (hfsq + r) + k * LN2_LO))];
}

function log(x: number): number {
  if (Number.isNaN(x) || x < 0) return NaN;
  if (x === 0) return -Infinity;
  if (x === Infinity) return Infinity;
  const [big, small] = logParts(x);
  return big + small;
}

function log2(x: number): number {
  if (x > 0 && x < Infinity) {
    const hx = highWord(x);
    // Exact powers of two give exact integers, as Math.log2 does.
    if ((hx & 0x000fffff) === 0 && lowWord(x) === 0 && hx >= 0x00100000) {
      return (hx >> 20) - 1023;
    }
  }
  return log(x) * 1.4426950408889634;
}

function log10(x: number): number {
  return log(x) * 0.4342944819032518;
}

function isOddInteger(y: number): boolean {
  return Number.isInteger(y) && Math.abs(y) < 9007199254740992 && Math.abs(y % 2) === 1;
}

/** x^n for an integer n by repeated squaring. */
function powInt(x: number, n: number): number {
  let result = 1;
  let base = x;
  let e = Math.abs(n);
  while (e > 0) {
    if (e % 2 === 1) result *= base;
    base *= base;
    e = Math.floor(e / 2);
  }
  return n < 0 ? 1 / result : result;
}

/** Product of a and b as an unrounded pair `[high, low]` (Dekker). */
function twoProduct(a: number, b: number): [number, number] {
  const p = a * b;
  const ca = 134217729 * a; // 2^27 + 1 splits a double into two 26-bit halves
  const ah = ca - (ca - a);
  const al = a - ah;
  const cb = 134217729 * b;
  const bh = cb - (cb - b);
  const bl = b - bh;
  return [p, ah * bh - p + ah * bl + al * bh + al * bl];
}

/** e^(y·ln x) for a finite x > 0, keeping extra bits of y·ln x. */
function expLog(x: number, y: number): number {
  const [big, small] = logParts(x);
  const high = big + small;
  const low = small - (high - big);
  const [ph, pl] = twoProduct(y, high);
  if (!Number.isFinite(ph)) return exp(ph);
  return exp(ph) * (1 + (pl + y * low));
}

function pow(x: number, y: number): number {
  if (Number.isNaN(y)) return NaN;
  if (y === 0) return 1;
  if (Number.isNaN(x)) return NaN;
  if (!Number.isFinite(y)) {
    const a = Math.abs(x);
    if (a === 1) return NaN;
    return a > 1 === y > 0 ? Infinity : 0;
  }
  if (x === Infinity) return y > 0 ? Infinity : 0;
  if (x === -Infinity) {
    const odd = isOddInteger(y);
    return y > 0 ? (odd ? -Infinity : Infinity) : odd ? -0 : 0;
  }
  if (x === 0) {
    const odd = isOddInteger(y) && signBit(x);
    return y > 0 ? (odd ? -0 : 0) : odd ? -Infinity : Infinity;
  }
  if (Number.isInteger(y) && Math.abs(y) <= 64) return powInt(x, y);
  if (x < 0) {
    if (!Number.isInteger(y)) return NaN;
    const magnitude = expLog(-x, y);
    return isOddInteger(y) ? -magnitude : magnitude;
  }
  if (y === 0.5) return Math.sqrt(x);
  return expLog(x, y);
}

function cbrt(x: number): number {
  if (!Number.isFinite(x) || x === 0) return x;
  const a = Math.abs(x);
  let t = exp(log(a) / 3);
  // One Newton step brings the estimate to about 1 ulp.
  t -= (t * t * t - a) / (3 * t * t);
  return x < 0 ? -t : t;
}

function hypot(...values: number[]): number {
  let max = 0;
  let nan = false;
  for (const v of values) {
    const a = Math.abs(v);
    if (a === Infinity) return Infinity;
    if (Number.isNaN(a)) nan = true;
    else if (a > max) max = a;
  }
  if (nan) return NaN;
  if (max === 0) return 0;
  let sum = 0;
  for (const v of values) {
    const r = v / max;
    sum += r * r;
  }
  return max * Math.sqrt(sum);
}

/**
 * Math that returns the same bits on every JavaScript engine (V8 in Chrome, Electron and Android;
 * JavaScriptCore in Safari and iOS). Use it instead of `Math` in simulation code of online games,
 * where one different digit desynchronizes the players. The lint rule `blacklight/deterministic`
 * points to it.
 *
 * Results are within a few units in the last place of `Math`'s, not always the same digits.
 * `sqrt`, `abs`, `floor`, `ceil`, `round`, `trunc`, `sign`, `min`, `max`, `fround` and `imul`
 * are exact by specification and come from `Math` unchanged.
 *
 * @example
 * ```ts
 * import { DMath } from '@blacklight/core';
 *
 * const angle = DMath.atan2(target.y - this.y, target.x - this.x);
 * this.velocity.set(DMath.cos(angle) * 200, DMath.sin(angle) * 200);
 * ```
 */
export const DMath = Object.freeze({
  PI,
  E: 2.718281828459045,
  LN2: 0.6931471805599453,
  LN10: 2.302585092994046,
  LOG2E: 1.4426950408889634,
  LOG10E: 0.4342944819032518,
  SQRT2: 1.4142135623730951,
  SQRT1_2: 0.7071067811865476,
  sin,
  cos,
  tan,
  asin,
  acos,
  atan,
  atan2,
  exp,
  log,
  log2,
  log10,
  pow,
  cbrt,
  hypot,
  sqrt: Math.sqrt,
  abs: Math.abs,
  floor: Math.floor,
  ceil: Math.ceil,
  round: Math.round,
  trunc: Math.trunc,
  sign: Math.sign,
  min: Math.min,
  max: Math.max,
  fround: Math.fround,
  imul: Math.imul,
});
