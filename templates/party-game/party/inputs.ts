// Actions a mini-game reads, and the bytes they take on the network (one byte per player).
import { InputCodec } from '@blacklight/net';

/**
 * Directions, `action` (shove, throw, guess), `confirm` (guess with the pad's A) and `card`
 * (the power card). Online, these are the only actions the simulation sees.
 */
export const PARTY_INPUTS = new InputCodec({
  buttons: ['left', 'right', 'up', 'down', 'action', 'confirm', 'card'],
});
