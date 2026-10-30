// @blacklight-deterministic
import { DMath } from '@blacklight/core';
import Avatar from '@objects/avatar/avatar.object';
import { clamp } from '../../../../party/geometry';
import { LANDING_Y, PLAYER_SPEED, STAGES, UPPER } from '../../rules';
import type DoorReferee from '../door-referee/door-referee.object';

/** A player choosing a side, then dropping through its door and flying back up. */
export default class Jumper extends Avatar {
  /** Height on the upper floor, where the player returns after each round. */
  home = 0;

  override update(): void {
    super.update();
    const referee = this.referee as DoorReferee;
    if (this.home === 0) this.home = this.y;
    if (!referee.playing) return;
    const t = referee.stageClock / STAGES[referee.stage];
    switch (referee.stage) {
      case 'choose': {
        const heading = this.heading();
        const dt = this.game.time.dt;
        if (heading.x !== 0 || heading.y !== 0) this.facing = DMath.atan2(heading.y, heading.x);
        const r = this.radius;
        this.x = clamp(this.x + heading.x * PLAYER_SPEED * dt, UPPER.left + r, UPPER.right - r);
        this.home = clamp(
          this.home + heading.y * PLAYER_SPEED * dt,
          UPPER.top + r,
          UPPER.bottom - r,
        );
        this.y = this.home;
        break;
      }
      case 'drop':
        // Falls faster and faster (t²).
        this.y = this.home + (LANDING_Y - this.home) * t * t;
        break;
      case 'strike':
        this.y = LANDING_Y;
        break;
      case 'rise':
        this.y = LANDING_Y + (this.home - LANDING_Y) * t;
        break;
    }
  }
}
