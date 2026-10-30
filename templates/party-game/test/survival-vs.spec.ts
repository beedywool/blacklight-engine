import { describe, expect, it } from 'vitest';
import { SECOND } from '../party/rules';
import SurvivalVs from '../scenes/survival-vs/survival-vs.scene';
import { ENEMY_MAX_SPEED, ENEMY_SPEED, enemySpeed } from '../scenes/survival-vs/rules';
import { bot, playOffline, playOnline } from './harness';

describe('Survival VS', () => {
  it('enemies speed up every five seconds, up to a cap', () => {
    expect(enemySpeed(0)).toBe(ENEMY_SPEED);
    expect(enemySpeed(5 * SECOND)).toBeGreaterThan(ENEMY_SPEED);
    expect(enemySpeed(600 * SECOND)).toBe(ENEMY_MAX_SPEED);
  });

  it('three hits knock a player out; the game ends when everybody is out', async () => {
    for (const arena of [0, 1, 2]) {
      const { scene } = await playOffline(SurvivalVs, 'survival-vs', {
        players: 2,
        settings: [arena, 2],
      });
      const referee = scene.referee;
      expect(referee.finished).toBe(true);
      expect(referee.out).toEqual([true, true]);
      expect(referee.hits).toEqual([3, 3]);
      // One point per second survived.
      for (const score of referee.scores) expect(score).toBeGreaterThan(0);
    }
  });

  it('plays online without desync', async () => {
    const { result } = await playOnline(SurvivalVs, 'survival-vs', {
      players: 3,
      settings: [1, 1],
      frames: 1500,
      script: bot,
    });
    expect(result.desyncs).toEqual([]);
    expect(result.agreedFrames).toBeGreaterThan(10);
  });
});
