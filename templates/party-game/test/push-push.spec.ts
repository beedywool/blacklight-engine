import { describe, expect, it } from 'vitest';
import { INTRO_STEPS, SECOND } from '../party/rules';
import PushPush from '../scenes/push-push/push-push.scene';
import { bot, playOffline, playOnline } from './harness';

describe('Push-Push', () => {
  it('ends at the time limit when nobody moves, one point per second', async () => {
    const { scene, steps } = await playOffline(PushPush, 'push-push', {
      players: 2,
      settings: [0, 1],
    });
    expect(scene.referee.finished).toBe(true);
    expect(steps).toBeLessThan(INTRO_STEPS + 31 * SECOND + 100);
    expect([...scene.results().values()]).toEqual([30, 30]);
  });

  it('a shove pushes the other wrestler out of a small ring', async () => {
    // Player 1 walks right into player 2 (facing it) and shoves until it falls out.
    const { scene } = await playOffline(PushPush, 'push-push', {
      players: 2,
      settings: [1, 2],
      script: (player, step) => (player === 1 ? (step % 10 < 2 ? ['action'] : ['left']) : []),
    });
    const referee = scene.referee;
    expect(referee.finished).toBe(true);
    expect(referee.out).toEqual([false, true]);
    expect(referee.scores[0]).toBeGreaterThan(referee.scores[1]!);
  });

  it('plays online with four players without desync', async () => {
    const { result } = await playOnline(PushPush, 'push-push', {
      players: 4,
      settings: [1, 1],
      frames: 1200,
      script: bot,
    });
    expect(result.desyncs).toEqual([]);
    expect(result.agreedFrames).toBeGreaterThan(10);
  });
});
