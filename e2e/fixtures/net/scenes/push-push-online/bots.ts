import { INPUTS } from './rules';

const DIRECTIONS: [boolean, boolean, boolean, boolean][] = [
  [false, true, false, false],
  [false, true, false, true],
  [false, false, false, true],
  [true, false, false, true],
  [true, false, false, false],
  [true, false, true, false],
  [false, false, true, false],
  [false, true, true, false],
  [false, false, false, false],
];

/** Integer hash: the same bot plays the same way on every machine and engine. */
function hash(a: number, b: number): number {
  let h = Math.imul(a ^ 0x9e3779b9, 0x85ebca6b) ^ Math.imul(b, 0xc2b2ae35);
  h ^= h >>> 15;
  h = Math.imul(h, 0x2c1b3c6d);
  h ^= h >>> 12;
  return h >>> 0;
}

/**
 * Input of a bot for a step: holds a direction for about a third of a second, and taps the
 * shove now and then. Inputs change often, which forces rollbacks.
 */
export function botInput(player: number, frame: number): Uint8Array {
  const segment = Math.floor(frame / 20);
  const h = hash(player, segment);
  const [left, right, up, down] = DIRECTIONS[h % DIRECTIONS.length]!;
  const action = (h >>> 8) % 3 === 0 && frame % 20 < 3;
  return INPUTS.encode({ left, right, up, down, action });
}
