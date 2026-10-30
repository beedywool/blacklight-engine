import { describe, expect, it } from 'vitest';
import Obstacles from '../scenes/obstacles/obstacles.scene';
import type Wall from '../scenes/obstacles/objects/wall/wall.object';
import { BASE_SPEED, MAX_SPEED, WALL_WIDTH, wallSpeed } from '../scenes/obstacles/rules';
import { bot, playOffline, playOnline } from './harness';

describe('Obstacles', () => {
  it('walls speed up every ten seconds; FAST starts two levels higher', () => {
    expect(wallSpeed(0, 0)).toBe(BASE_SPEED);
    expect(wallSpeed(600, 0)).toBeGreaterThan(BASE_SPEED);
    expect(wallSpeed(0, 2)).toBe(wallSpeed(1200, 0));
    expect(wallSpeed(60 * 3600, 0)).toBe(MAX_SPEED);
  });

  it('idle players end up in the water; walls passed score', async () => {
    const { scene } = await playOffline(Obstacles, 'obstacles', { players: 3, settings: [0, 1] });
    expect(scene.referee.finished).toBe(true);
    expect(scene.referee.out).toEqual([true, true, true]);
  });

  it('a player who dodges into the gaps scores', async () => {
    // Follows the gap of the nearest wall ahead.
    const { scene } = await playOffline(Obstacles, 'obstacles', {
      players: 1,
      settings: [0, 0],
      maxSteps: 150 + 20 * 60,
      script: (player, _, game) => {
        const runner = game.avatarOf(player);
        const wall = game
          .findAll<Wall>('wall')
          .filter((w) => runner && w.x + WALL_WIDTH / 2 > runner.x - runner.radius)
          .sort((a, b) => a.x - b.x)[0];
        if (!runner || !wall) return [];
        if (wall.gapY < runner.y - 20) return ['up'];
        if (wall.gapY > runner.y + 20) return ['down'];
        return [];
      },
    });
    expect(scene.referee.out).toEqual([false]);
    expect(scene.referee.scores[0]).toBeGreaterThan(3);
  });

  it('plays online without desync', async () => {
    const { result } = await playOnline(Obstacles, 'obstacles', {
      players: 2,
      settings: [1, 0],
      frames: 1500,
      script: bot,
    });
    expect(result.desyncs).toEqual([]);
    expect(result.agreedFrames).toBeGreaterThan(10);
  });
});
