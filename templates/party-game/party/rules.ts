// Timings and sizes shared by every mini-game. Durations are fixed steps (60 per second): the
// simulation counts steps, never the wall clock, so online matches replay identically.

/** Steps per second. */
export const SECOND = 60;
/** Play area of a mini-game, in the match shell (virtual pixels). */
export const PLAY = { width: 1500, height: 1000 } as const;
/** Title banner on screen, controls locked. */
export const INTRO_STEPS = 150;
/** "GO!" zooms out during the first steps of play. */
export const GO_STEPS = 40;
/** Shield of the power card. */
export const SHIELD_STEPS = 3 * SECOND;
/** "FINISH!" stays this long before the match shell shows the end panel. */
export const OUTRO_STEPS = 90;
/** Radius of a player's body. */
export const AVATAR_RADIUS = 28;
