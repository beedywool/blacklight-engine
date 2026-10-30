// @blacklight-deterministic
import { DMath } from '@blacklight/core';
import Avatar from '@objects/avatar/avatar.object';
import { clamp, inside } from '../../../../party/geometry';
import { FIELD, PLAYER_SPEED, WALL_WIDTH, WATER_X } from '../../rules';
import type Wall from '../wall/wall.object';

/** A player dodging walls; pushed into the water, out. */
export default class Runner extends Avatar {
  override update(): void {
    super.update();
    const referee = this.referee;
    const dt = this.game.time.dt;
    const heading = this.heading();
    if (heading.x !== 0 || heading.y !== 0) {
      this.facing = DMath.atan2(heading.y, heading.x);
      this.x += heading.x * PLAYER_SPEED * dt;
      this.y += heading.y * PLAYER_SPEED * dt;
    }
    const r = this.radius;
    this.x = Math.min(this.x, FIELD.right - r);
    this.y = clamp(this.y, FIELD.top + r, FIELD.bottom - r);
    if (!referee.playing) return;
    const index = referee.index(this.player);
    for (const wall of this.scene.findAll<Wall>('wall')) {
      // A shielded player goes through walls.
      if (!this.shielded) {
        for (const part of wall.parts()) {
          // Overlapping a solid part: out by the side of the wall the player is on.
          const near = {
            x: part.x - r,
            y: part.y - r,
            width: part.width + r * 2,
            height: part.height + r * 2,
          };
          if (!inside(this.x, this.y, near)) continue;
          this.x = this.x < wall.x ? part.x - r : part.x + part.width + r;
        }
      }
      const bit = 1 << index;
      if (!(wall.passed & bit) && wall.x + WALL_WIDTH / 2 < this.x - r) {
        wall.passed |= bit;
        referee.score(this.player, 1);
      }
    }
    if (this.x < WATER_X) {
      this.scene.audio.play('splash');
      referee.knockOut(this.player);
      this.destroy();
    }
  }
}
