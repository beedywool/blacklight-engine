// @blacklight-deterministic
// Air Hockey: two teams, one puck. A goal gives a point to every player of the scoring team; the
// first team to the goal target wins and its players get a bonus.
import { SECOND } from '../../party/rules';

export const RINK = { left: 40, right: 1460, top: 40, bottom: 960 } as const;
export const MIDDLE = (RINK.left + RINK.right) / 2;
/** Goal mouth, top and bottom. */
export const GOAL = { top: 370, bottom: 630 } as const;
export const MALLET_RADIUS = 40;
/** Mallet radius while the shield card is on. */
export const SHIELD_RADIUS = 64;
export const MALLET_SPEED = 640;
export const PUCK_RADIUS = 26;
/** Fraction of the puck's speed kept each step. */
export const PUCK_FRICTION = 0.997;
/** The puck never slows below this once served: idle rinks still see goals. */
export const PUCK_MIN_SPEED = 360;
export const PUCK_MAX_SPEED = 1700;
/** Speed added along the normal when a mallet hits the puck. */
export const KICK = 320;
export const SERVE_SPEED = 420;
/** Steps the puck rests at the center after a goal. */
export const SERVE_DELAY = SECOND;
/** Without a goal for this long, the puck is served again from the center (a face-off). */
export const FACE_OFF_AFTER = 12 * SECOND;
/** Share of the puck's speed always kept across the rink, so it never bounces up and down forever. */
export const MIN_ACROSS = 0.25;
/** Largest turn (radians) a board gives the puck: real boards are never perfect, and a perfect one
 * lets the puck settle into a loop that never reaches a goal mouth. */
export const BOARD_SPIN = 0.12;
export const WIN_BONUS = 3;
/** Goals to win by the GOALS TO WIN setting. */
export const GOALS_TO_WIN = [3, 5, 7, 10] as const;

/** Team of each player (0 left, 1 right) by the TEAMS setting: alternate, halves, one vs all. */
export function teams(count: number, layout: number): number[] {
  return Array.from({ length: count }, (_, i) => {
    if (layout === 1) return i < Math.ceil(count / 2) ? 0 : 1;
    if (layout === 2) return i === 0 ? 0 : 1;
    return i % 2;
  });
}
