import { describe, expect, it } from 'vitest';
import type Block from '../scenes/hide-and-seek/objects/block/block.object';
import type SeekReferee from '../scenes/hide-and-seek/objects/seek-referee/seek-referee.object';
import HideAndSeek from '../scenes/hide-and-seek/hide-and-seek.scene';
import { BLOCKS, FIND_POINTS } from '../scenes/hide-and-seek/rules';
import { bot, playOffline, playOnline } from './harness';

describe('Hide and Seek', () => {
  it('runs hide → throw → guess and ends on time when nobody plays', async () => {
    const { scene } = await playOffline(HideAndSeek, 'hide-and-seek', {
      players: 3,
      settings: [1, 2],
    });
    const referee = scene.referee as SeekReferee;
    expect(referee.finished).toBe(true);
    expect(referee.seeker).toBe(1);
    // Hiders scored every second of the throw and guess stages, plus the hidden bonus.
    expect(referee.scores[0]).toBe(0);
    expect(referee.scores[1]).toBe(10 + 15 + 2);
    expect(referee.scores[2]).toBe(10 + 15 + 2);
  });

  it('balls knock blocks away; a guess finds a hider in the open, not through a block', async () => {
    // Player 1 seeks. Player 2 stays in the open; player 3 hides behind the first block.
    const target = BLOCKS[0]!;
    const { scene } = await playOffline(HideAndSeek, 'hide-and-seek', {
      players: 3,
      settings: [1, 2],
      maxSteps: 2000,
      script: (player, step, game) => {
        const referee = game.referee as SeekReferee;
        if (player === 3 && referee.stage === 'hide') {
          const me = game.avatarOf(player);
          if (!me) return [];
          const cx = target.x + target.width / 2;
          const cy = target.y + target.height / 2;
          return [
            ...(me.x < cx - 10 ? (['right'] as const) : me.x > cx + 10 ? (['left'] as const) : []),
            ...(me.y < cy - 10 ? (['down'] as const) : me.y > cy + 10 ? (['up'] as const) : []),
          ];
        }
        if (player !== 1 || referee.stage === 'hide') return [];
        // Seeker: throw one ball at the second block, then guess at player 2 and at player 3.
        const crosshair = game.find('Crosshair')!;
        const aim =
          referee.stage === 'throw'
            ? { x: BLOCKS[1]!.x + 50, y: BLOCKS[1]!.y + 50 }
            : (game.avatarOf(2) ?? game.avatarOf(3) ?? crosshair);
        const moves = [
          ...(crosshair.x < aim.x - 8
            ? (['right'] as const)
            : crosshair.x > aim.x + 8
              ? (['left'] as const)
              : []),
          ...(crosshair.y < aim.y - 8
            ? (['down'] as const)
            : crosshair.y > aim.y + 8
              ? (['up'] as const)
              : []),
        ];
        if (moves.length > 0) return moves;
        return step % 10 === 0 ? ['action'] : [];
      },
    });
    const referee = scene.referee as SeekReferee;
    expect(referee.finished).toBe(true);
    expect(scene.findAll<Block>('block')).toHaveLength(BLOCKS.length - 1);
    // Player 2 was found; player 3 behind a block could not be guessed.
    expect(referee.out).toEqual([false, true, false]);
    expect(referee.scores[0]).toBe(FIND_POINTS);
  });

  it('plays online without desync', async () => {
    const { result } = await playOnline(HideAndSeek, 'hide-and-seek', {
      players: 3,
      settings: [0, 2],
      frames: 1800,
      script: bot,
    });
    expect(result.desyncs).toEqual([]);
    expect(result.agreedFrames).toBeGreaterThan(10);
  });
});
