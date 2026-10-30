// @blacklight-deterministic
// Obstacles: walls with a gap slide in from the right and push the players towards the water on
// the left. One point per wall passed; the walls get faster every ten seconds.
import { SECOND } from '../../party/rules';

/** Players left of this line fall into the water. */
export const WATER_X = 170;
export const FIELD = { top: 40, bottom: 960, right: 1460 } as const;
export const PLAYER_SPEED = 430;
export const WALL_WIDTH = 70;
/** Walls appear right of the play area. */
export const WALL_START_X = 1560;
/** Distance between two walls. */
export const WALL_SPACING = 560;
/** Gap height by the GAPS setting (wide, narrow). */
export const GAP_HEIGHT = [330, 220] as const;
/** Levels skipped at the start by the START SPEED setting (normal, fast). */
export const START_LEVEL = [0, 2] as const;
export const LEVEL_EVERY = 10 * SECOND;
export const BASE_SPEED = 260;
export const SPEED_PER_LEVEL = 70;
export const MAX_SPEED = 900;

/** Wall speed (pixels per second) after `elapsed` steps of play. */
export function wallSpeed(elapsed: number, startLevel: number): number {
  const level = startLevel + Math.floor(elapsed / LEVEL_EVERY);
  return Math.min(MAX_SPEED, BASE_SPEED + level * SPEED_PER_LEVEL);
}
