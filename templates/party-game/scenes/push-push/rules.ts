// @blacklight-deterministic
// Push-Push: sumo in a ring. `action` shoves whoever stands in front of you; leaving the ring
// knocks you out. One point per second in the ring, three more for the last one standing.
import { SECOND } from '../../party/rules';

export const CENTER = { x: 750, y: 500 };
/** Ring radius by the RING setting (large, small). */
export const RING_RADIUS = [440, 340] as const;
/** Time limit by the TIME LIMIT setting (60, 30, 90 s). */
export const TIME_LIMIT = [60 * SECOND, 30 * SECOND, 90 * SECOND] as const;
/** Pixels per second² while a direction is held. */
export const ACCELERATION = 2200;
/** Fraction of the speed kept each step. */
export const FRICTION = 0.9;
/** Speed given to a shoved wrestler, pixels per second. */
export const SHOVE = 1300;
/** Reach of a shove from the shover's center. */
export const REACH = 110;
/** Half-angle of the shove cone, radians. */
export const CONE = 1;
/** Steps between two shoves. */
export const SHOVE_COOLDOWN = 24;
/** Steps a shoved wrestler cannot steer. */
export const STUN = 14;
export const LAST_STANDING_BONUS = 3;
