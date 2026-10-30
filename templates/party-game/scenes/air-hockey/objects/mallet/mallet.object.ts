// @blacklight-deterministic
import { DMath } from '@blacklight/core';
import Avatar from '@objects/avatar/avatar.object';
import { clamp } from '../../../../party/geometry';
import { MALLET_RADIUS, MALLET_SPEED, MIDDLE, RINK, SHIELD_RADIUS } from '../../rules';
import type RinkReferee from '../rink-referee/rink-referee.object';

/** A player's mallet, kept in its team's half. */
export default class Mallet extends Avatar {
  static override tags = ['mallet'];

  override radius = MALLET_RADIUS;
  /** Speed of the last step (pixels per second): the puck gets it on contact. */
  vx = 0;
  vy = 0;

  override update(): void {
    super.update();
    const referee = this.referee as RinkReferee;
    const dt = this.game.time.dt;
    this.radius = this.shielded ? SHIELD_RADIUS : MALLET_RADIUS;
    const heading = this.heading();
    const x0 = this.x;
    const y0 = this.y;
    if (heading.x !== 0 || heading.y !== 0) {
      this.facing = DMath.atan2(heading.y, heading.x);
      this.x += heading.x * MALLET_SPEED * dt;
      this.y += heading.y * MALLET_SPEED * dt;
    }
    const r = this.radius;
    const left = referee.teamOf(this.player) === 0;
    this.x = left
      ? clamp(this.x, RINK.left + r, MIDDLE - r)
      : clamp(this.x, MIDDLE + r, RINK.right - r);
    this.y = clamp(this.y, RINK.top + r, RINK.bottom - r);
    this.vx = (this.x - x0) / dt;
    this.vy = (this.y - y0) / dt;
  }
}
