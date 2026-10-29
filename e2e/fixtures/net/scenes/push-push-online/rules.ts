// Push-Push (NumX frame 31): sumo in a ring. The action button shoves whoever stands in front of
// you; leaving the ring knocks you out; the last one standing scores and a new round starts.
import { InputCodec } from '@blacklight/net';

export const ARENA = { width: 640, height: 360 };
export const RING = { x: 320, y: 180, radius: 150 };
export const WRESTLER_RADIUS = 14;
/** Pixels per second² while a direction is held. */
export const ACCELERATION = 900;
/** Fraction of the speed kept each step. */
export const FRICTION = 0.9;
/** Speed given to a shoved wrestler, pixels per second. */
export const SHOVE = 520;
/** Reach of a shove from the shover's center, pixels. */
export const REACH = 46;
/** Steps between two shoves. */
export const SHOVE_COOLDOWN = 24;
/** Steps a shoved wrestler cannot steer. */
export const STUN = 14;
/** Steps between the end of a round and the next. */
export const ROUND_BREAK = 60;
export const COLORS = [
  0xf2f2f2, 0xe84a5f, 0x3fa7d6, 0xf6c445, 0x59cd90, 0xb07bd8, 0xff8c42, 0x9aa5b1,
];

/** Actions sent over the network: four directions and the shove, one byte per player. */
export const INPUTS = new InputCodec({ buttons: ['left', 'right', 'up', 'down', 'action'] });
