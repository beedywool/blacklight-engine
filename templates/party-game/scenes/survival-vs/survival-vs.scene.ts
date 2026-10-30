// @blacklight-deterministic
import { DMath } from '@blacklight/core';
import { MiniGame } from '../../party/minigame';
import { PLAY } from '../../party/rules';
import Enemy from './objects/enemy/enemy.object';
import SurvivalReferee from './objects/survival-referee/survival-referee.object';
import Survivor from './objects/survivor/survivor.object';
import { ARENAS, BORDER, ENEMY_COUNT } from './rules';

/** Survival VS: the last one hit wins; every second alive is a point. */
export default class SurvivalVs extends MiniGame<SurvivalReferee> {
  protected override setup(): void {
    const pillars = ARENAS[this.settings[0]] ?? ARENAS[0]!;
    this.backdrop((pen) => {
      pen.rect(0, 0, PLAY.width, PLAY.height).fill(0x111111);
      pen.rect(BORDER, BORDER, PLAY.width - BORDER * 2, PLAY.height - BORDER * 2).fill(0x1d2433);
      for (let x = BORDER; x < PLAY.width - BORDER; x += 120)
        pen.rect(x, BORDER, 2, PLAY.height - BORDER * 2).fill(0x263047);
      for (let y = BORDER; y < PLAY.height - BORDER; y += 120)
        pen.rect(BORDER, y, PLAY.width - BORDER * 2, 2).fill(0x263047);
      for (const p of pillars) {
        pen.rect(p.x, p.y, p.width, p.height).fill(0x56607a);
        pen.rect(p.x, p.y, p.width, 14).fill(0x7c88a6);
      }
    });
    const referee = this.spawn(SurvivalReferee);
    referee.pillars = pillars.map((p) => ({ ...p }));
    referee.begin(this.contestants.map((c) => c.player));
    this.spawnPlayers(Survivor, (i, count) => ({
      x: PLAY.width / 2 + (i - (count - 1) / 2) * 130,
      y: 140,
      facing: DMath.PI / 2,
    }));
    const enemies = ENEMY_COUNT[this.settings[1]] ?? 1;
    for (let i = 0; i < enemies; i++) {
      // Up and away from the bottom wall, at a seeded angle.
      const angle = this.random.float(-DMath.PI * 0.8, -DMath.PI * 0.2);
      this.spawn(Enemy, {
        x: PLAY.width / 2 + (i - (enemies - 1) / 2) * 260,
        y: PLAY.height - 140,
        dx: DMath.cos(angle),
        dy: DMath.sin(angle),
      });
    }
  }

  override detail(player: number): string | undefined {
    const lives = this.referee.lives(player);
    return lives > 0 ? `${lives} ${lives === 1 ? 'LIFE' : 'LIVES'}` : undefined;
  }
}
