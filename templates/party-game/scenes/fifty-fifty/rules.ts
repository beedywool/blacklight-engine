// @blacklight-deterministic
// 50-50: pick a side before the doors open. Everybody drops through the floor, the cloud strikes
// one side at random, and the survivors fly back up for the next round. One point per round.
import { SECOND } from '../../party/rules';

export const MIDDLE = 750;
/** Upper floor, where players choose. */
export const UPPER = { left: 40, right: 1460, top: 90, bottom: 400 } as const;
/** Height of the doors in the floor. */
export const FLOOR_Y = 440;
/** Where players land under the doors. */
export const LANDING_Y = 790;
export const PLAYER_SPEED = 520;
/** Steps of each stage of a round. */
export const STAGES = {
  choose: 4 * SECOND,
  drop: 50,
  strike: 50,
  rise: 50,
} as const;
export type Stage = keyof typeof STAGES;
/** Lives by the LIVES setting. */
export const LIVES = [1, 2, 3] as const;
/** The game stops after this many rounds whatever happens. */
export const MAX_ROUNDS = 30;
export const LAST_STANDING_BONUS = 3;

/** Side of a position: 0 left, 1 right. */
export function sideOf(x: number): number {
  return x < MIDDLE ? 0 : 1;
}

/** Stage that follows another one. */
export function nextStage(stage: Stage): Stage {
  return stage === 'choose'
    ? 'drop'
    : stage === 'drop'
      ? 'strike'
      : stage === 'strike'
        ? 'rise'
        : 'choose';
}
