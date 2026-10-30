// @blacklight-deterministic
import { DMath } from '@blacklight/core';
import { MiniGame } from '../../party/minigame';
import { PLAY } from '../../party/rules';
import Runner from './objects/runner/runner.object';
import WallReferee from './objects/wall-referee/wall-referee.object';
import { FIELD, GAP_HEIGHT, START_LEVEL, WATER_X } from './rules';

/** Obstacles: stay out of the water as long as you can. */
export default class Obstacles extends MiniGame<WallReferee> {
  protected override setup(): void {
    this.backdrop((pen) => {
      pen.rect(0, 0, PLAY.width, PLAY.height).fill(0x6fbf4a);
      for (let x = WATER_X + 40; x < PLAY.width; x += 140)
        for (let y = FIELD.top + 30; y < FIELD.bottom; y += 120)
          pen.rect(x + ((y / 120) % 2) * 60, y, 18, 6).fill(0x5aa63a);
      pen.rect(0, 0, WATER_X, PLAY.height).fill(0x1e78c8);
      for (let y = 30; y < PLAY.height; y += 80)
        pen.rect(20 + (y % 160) / 4, y, 70, 8).fill(0x6bb6f0);
      pen.rect(WATER_X - 12, 0, 12, PLAY.height).fill(0xd9c08a);
    });
    const referee = this.spawn(WallReferee);
    referee.begin(this.contestants.map((c) => c.player));
    referee.startLevel = START_LEVEL[this.settings[0]] ?? 0;
    referee.gapHeight = GAP_HEIGHT[this.settings[1]] ?? GAP_HEIGHT[0];
    this.spawnPlayers(Runner, (i, count) => ({
      x: 820,
      y: FIELD.top + ((i + 1) * (FIELD.bottom - FIELD.top)) / (count + 1),
      facing: DMath.PI,
    }));
  }

  override notice(): string | undefined {
    const referee = this.referee;
    if (!referee.playing) return undefined;
    return `LEVEL ${referee.startLevel + Math.floor(referee.clock / 600) + 1}`;
  }
}
