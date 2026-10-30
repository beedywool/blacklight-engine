// @blacklight-deterministic
// Survival VS: dodge the bouncing enemies. Three hits and you are out; one point per second
// survived. Enemies speed up every five seconds.
import type { Rect } from '@blacklight/core';
import { SECOND } from '../../party/rules';

export const BORDER = 30;
export const PLAYER_SPEED = 430;
export const LIVES = 3;
/** Steps without damage after a hit (the player blinks). */
export const INVULNERABLE = SECOND;
export const ENEMY_RADIUS = 38;
export const ENEMY_SPEED = 340;
/** Speed added every `SPEED_UP_EVERY` steps, up to `ENEMY_MAX_SPEED`. */
export const ENEMY_SPEED_STEP = 45;
export const SPEED_UP_EVERY = 5 * SECOND;
export const ENEMY_MAX_SPEED = 950;

/** Obstacles by the ARENA setting: open, pillars, cross. */
export const ARENAS: readonly (readonly Rect[])[] = [
  [],
  [
    { x: 300, y: 260, width: 150, height: 150 },
    { x: 1050, y: 260, width: 150, height: 150 },
    { x: 300, y: 620, width: 150, height: 150 },
    { x: 1050, y: 620, width: 150, height: 150 },
  ],
  [
    { x: 690, y: 300, width: 120, height: 420 },
    { x: 460, y: 450, width: 580, height: 120 },
  ],
];

/** Number of enemies by the ENEMIES setting. */
export const ENEMY_COUNT = [1, 2, 3] as const;

/** Speed of the enemies after `elapsed` steps of play. */
export function enemySpeed(elapsed: number): number {
  const steps = Math.floor(elapsed / SPEED_UP_EVERY);
  return Math.min(ENEMY_MAX_SPEED, ENEMY_SPEED + steps * ENEMY_SPEED_STEP);
}
