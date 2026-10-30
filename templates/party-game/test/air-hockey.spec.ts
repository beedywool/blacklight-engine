import { describe, expect, it } from 'vitest';
import AirHockey from '../scenes/air-hockey/air-hockey.scene';
import { teams } from '../scenes/air-hockey/rules';
import { bot, playOffline, playOnline } from './harness';

describe('Air Hockey', () => {
  it('splits the players into two teams by the TEAMS setting', () => {
    expect(teams(4, 0)).toEqual([0, 1, 0, 1]);
    expect(teams(5, 1)).toEqual([0, 0, 0, 1, 1]);
    expect(teams(4, 2)).toEqual([0, 1, 1, 1]);
  });

  it('the first team to the goal target wins; every goal scores for the whole team', async () => {
    const { scene, steps } = await playOffline(AirHockey, 'air-hockey', {
      players: 4,
      settings: [0, 0],
    });
    const referee = scene.referee;
    expect(referee.finished).toBe(true);
    expect(Math.max(...referee.goals)).toBe(3);
    const winner = referee.goals[0]! > referee.goals[1]! ? 0 : 1;
    referee.players.forEach((_, i) => {
      const goals = referee.goals[referee.teams[i]!]!;
      expect(referee.scores[i]).toBe(goals + (referee.teams[i] === winner ? 3 : 0));
    });
    expect(steps).toBeLessThan(60 * 60 * 3);
  });

  it('plays online without desync', async () => {
    const { result } = await playOnline(AirHockey, 'air-hockey', {
      players: 2,
      settings: [0, 3],
      frames: 1500,
      script: bot,
    });
    expect(result.desyncs).toEqual([]);
    expect(result.agreedFrames).toBeGreaterThan(10);
  });
});
