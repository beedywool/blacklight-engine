// @blacklight-deterministic
import { DMath } from '@blacklight/core';
import Avatar from '@objects/avatar/avatar.object';
import { circleRect, clamp, length } from '../../../../party/geometry';
import { PLAY } from '../../../../party/rules';
import { BORDER, INVULNERABLE, LIVES, PLAYER_SPEED } from '../../rules';
import type Enemy from '../enemy/enemy.object';
import type SurvivalReferee from '../survival-referee/survival-referee.object';

/** A player dodging enemies: three hits and out. */
export default class Survivor extends Avatar {
  override update(): void {
    super.update();
    const referee = this.referee as SurvivalReferee;
    const dt = this.game.time.dt;
    const heading = this.heading();
    if (heading.x !== 0 || heading.y !== 0) {
      this.facing = DMath.atan2(heading.y, heading.x);
      this.x += heading.x * PLAYER_SPEED * dt;
      this.y += heading.y * PLAYER_SPEED * dt;
    }
    const r = this.radius;
    this.x = clamp(this.x, BORDER + r, PLAY.width - BORDER - r);
    this.y = clamp(this.y, BORDER + r, PLAY.height - BORDER - r);
    for (const pillar of referee.pillars) {
      const push = circleRect(this.x, this.y, r, pillar);
      if (push) {
        this.x += push.x;
        this.y += push.y;
      }
    }
    if (!referee.playing) return;
    for (const enemy of this.scene.findAll<Enemy>('enemy')) {
      const dx = enemy.x - this.x;
      const dy = enemy.y - this.y;
      const d = length(dx, dy);
      const overlap = r + enemy.radius - d;
      if (overlap <= 0 || d === 0) continue;
      // The enemy bounces off the player, hit or shielded.
      enemy.bounce((dx / d) * overlap, (dy / d) * overlap, dx / d, dy / d);
      if (this.shielded) {
        this.scene.audio.play('shield');
      } else if (this.blink === 0) {
        this.hit(referee);
        if (!this.alive) return;
      }
    }
  }

  private hit(referee: SurvivalReferee): void {
    const i = referee.index(this.player);
    referee.hits[i] = (referee.hits[i] ?? 0) + 1;
    this.blink = INVULNERABLE;
    this.scene.audio.play('hit');
    // Online, steps replayed after a rollback must not shake the pad again.
    const net = (this.scene as { net?: { replaying: boolean } }).net;
    if (!net?.replaying) this.input.rumble(0.6, 0.3, 150);
    if (referee.hits[i]! >= LIVES) {
      referee.knockOut(this.player);
      this.destroy();
    }
  }
}
