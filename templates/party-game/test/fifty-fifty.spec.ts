import { describe, expect, it } from 'vitest';
import FiftyFifty from '../scenes/fifty-fifty/fifty-fifty.scene';
import { MAX_ROUNDS, nextStage, sideOf } from '../scenes/fifty-fifty/rules';
import { bot, playOffline, playOnline } from './harness';

describe('50-50', () => {
  it('rounds go choose → drop → strike → rise → choose', () => {
    expect(nextStage('choose')).toBe('drop');
    expect(nextStage('rise')).toBe('choose');
    expect(sideOf(10)).toBe(0);
    expect(sideOf(1400)).toBe(1);
  });

  it('last one standing: ends when one player is left, who gets the bonus', async () => {
    const { scene } = await playOffline(FiftyFifty, 'fifty-fifty', {
      players: 2,
      settings: [0, 0],
    });
    const referee = scene.referee;
    expect(referee.finished).toBe(true);
    expect(referee.round).toBeLessThanOrEqual(MAX_ROUNDS);
    const winners = referee.out.filter((out) => !out).length;
    expect(winners).toBeLessThanOrEqual(1);
    if (winners === 1) {
      const winner = referee.out.indexOf(false);
      expect(referee.scores[winner]).toBeGreaterThan(referee.scores[1 - winner]!);
    }
  });

  it('all out: a single player plays until the cloud gets them', async () => {
    const { scene } = await playOffline(FiftyFifty, 'fifty-fifty', {
      players: 1,
      settings: [1, 1],
    });
    const referee = scene.referee;
    expect(referee.finished).toBe(true);
    expect(referee.out[0] || referee.round === MAX_ROUNDS).toBe(true);
  });

  it('a shielded player is not struck', async () => {
    // Player 1 plays the card late in the choose stage, so the shield covers the strike.
    const { scene } = await playOffline(FiftyFifty, 'fifty-fifty', {
      players: 1,
      settings: [1, 0],
      maxSteps: 150 + 240 + 60,
      script: (_, step) => (step === 150 + 200 ? ['card'] : []),
    });
    expect(scene.referee.out).toEqual([false]);
    expect(scene.referee.cards).toEqual([false]);
  });

  it('plays online without desync', async () => {
    const { result } = await playOnline(FiftyFifty, 'fifty-fifty', {
      players: 4,
      settings: [1, 2],
      frames: 1500,
      script: bot,
    });
    expect(result.desyncs).toEqual([]);
    expect(result.agreedFrames).toBeGreaterThan(10);
  });
});
