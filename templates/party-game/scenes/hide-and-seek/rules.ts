// @blacklight-deterministic
// Hide and Seek: the hiders hide behind the blocks while the seeker looks away. The seeker then
// throws three balls that knock blocks away, and guesses where the hiders are with the pointer
// or a gamepad crosshair. Guessing over a block is refused. Hiders score every second they stay
// hidden; the seeker scores for each player found.
import type { Rect } from '@blacklight/core';
import { SECOND } from '../../party/rules';

export const FIELD = { left: 40, right: 1460, top: 40, bottom: 860 } as const;
/** Where the seeker stands and throws from. */
export const SEEKER_SPOT = { x: 750, y: 930 } as const;
export const HIDER_SPEED = 430;
export const CROSSHAIR_SPEED = 900;
/** Hiding time by the HIDING TIME setting (15, 10, 5 s). */
export const HIDING_TIME = [15 * SECOND, 10 * SECOND, 5 * SECOND] as const;
export const THROW_TIME = 10 * SECOND;
export const GUESS_TIME = 15 * SECOND;
export const BALLS = 3;
/** Steps a ball flies. */
export const BALL_FLIGHT = 36;
export const FIND_POINTS = 3;
export const HIDDEN_BONUS = 2;
/** A guess finds a hider within this distance of its center. */
export const GUESS_RADIUS = 44;

export type Stage = 'hide' | 'throw' | 'guess';

/** The blocks to hide behind. */
export const BLOCKS: readonly (Rect & { color: number })[] = [
  { x: 150, y: 140, width: 210, height: 190, color: 0xe60012 },
  { x: 520, y: 100, width: 190, height: 220, color: 0x2f7cf6 },
  { x: 880, y: 160, width: 230, height: 180, color: 0xf6c445 },
  { x: 1200, y: 110, width: 180, height: 210, color: 0x3ddc97 },
  { x: 260, y: 470, width: 220, height: 200, color: 0x9b5de5 },
  { x: 640, y: 430, width: 200, height: 230, color: 0xff7a1a },
  { x: 1000, y: 500, width: 240, height: 180, color: 0xff5fa2 },
  { x: 1240, y: 600, width: 170, height: 190, color: 0xc9d1d9 },
];
