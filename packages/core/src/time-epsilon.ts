/**
 * Slack, in ms, when accumulated game time is compared with a duration. A fixed step is not exact
 * in binary floating point (1000 / 60 ms, or 1 / 60 s), so six steps make 99.999… ms instead of
 * 100: compared exactly, a 10 fps frame, a 100 ms timer or a 300 ms tween lands one step late.
 * One microsecond is far below a step and far above the drift of hours of steps.
 *
 * @internal
 */
export const TIME_EPSILON_MS = 1e-6;
