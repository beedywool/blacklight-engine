// @blacklight-deterministic
import { DMath } from '@blacklight/core';
import Avatar from '@objects/avatar/avatar.object';
import { clamp } from '../../../../party/geometry';
import { FIELD, HIDER_SPEED } from '../../rules';
import type SeekReferee from '../seek-referee/seek-referee.object';

/** A hider: moves only while the seeker looks away. */
export default class Hider extends Avatar {
  static override tags = ['hider'];

  override update(): void {
    super.update();
    const referee = this.referee as SeekReferee;
    if (referee.stage !== 'hide') return;
    const heading = this.heading();
    const dt = this.game.time.dt;
    if (heading.x !== 0 || heading.y !== 0) this.facing = DMath.atan2(heading.y, heading.x);
    const r = this.radius;
    this.x = clamp(this.x + heading.x * HIDER_SPEED * dt, FIELD.left + r, FIELD.right - r);
    this.y = clamp(this.y + heading.y * HIDER_SPEED * dt, FIELD.top + r, FIELD.bottom - r);
  }
}
