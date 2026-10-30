// @blacklight-deterministic
import { DMath, angleDelta } from '@blacklight/core';
import Avatar from '@objects/avatar/avatar.object';
import { length } from '../../../../party/geometry';
import {
  ACCELERATION,
  CENTER,
  CONE,
  FRICTION,
  REACH,
  SHOVE,
  SHOVE_COOLDOWN,
  STUN,
} from '../../rules';
import type SumoReferee from '../sumo-referee/sumo-referee.object';

/** A wrestler: slides with inertia, shoves with `action`, falls out of the ring. */
export default class Sumo extends Avatar {
  static override tags = ['sumo'];

  vx = 0;
  vy = 0;
  /** Steps until the next shove. */
  cooldown = 0;
  /** Steps left without control after being shoved. */
  stunned = 0;

  override update(): void {
    super.update();
    const referee = this.referee as SumoReferee;
    const dt = this.game.time.dt;
    if (this.cooldown > 0) this.cooldown--;
    if (this.stunned > 0) {
      this.stunned--;
    } else {
      const heading = this.heading();
      if (heading.x !== 0 || heading.y !== 0) {
        this.facing = DMath.atan2(heading.y, heading.x);
        this.vx += heading.x * ACCELERATION * dt;
        this.vy += heading.y * ACCELERATION * dt;
      }
      if (this.controllable && this.input.pressed('action') && this.cooldown === 0) this.shove();
    }
    this.vx *= FRICTION;
    this.vy *= FRICTION;
    this.x += this.vx * dt;
    this.y += this.vy * dt;
    // Wrestlers do not overlap: each one steps back by half the overlap.
    for (const other of this.scene.findAll<Sumo>('sumo')) {
      if (other === this) continue;
      const dx = this.x - other.x;
      const dy = this.y - other.y;
      const d = length(dx, dy);
      const overlap = this.radius + other.radius - d;
      if (overlap <= 0 || d === 0) continue;
      this.x += ((dx / d) * overlap) / 2;
      this.y += ((dy / d) * overlap) / 2;
    }
    if (length(this.x - CENTER.x, this.y - CENTER.y) > referee.ringRadius) {
      referee.knockOut(this.player);
      this.destroy();
    }
  }

  private shove(): void {
    this.cooldown = SHOVE_COOLDOWN;
    this.scene.audio.play('push');
    for (const other of this.scene.findAll<Sumo>('sumo')) {
      if (other === this || other.shielded) continue;
      const dx = other.x - this.x;
      const dy = other.y - this.y;
      if (length(dx, dy) > REACH) continue;
      if (Math.abs(angleDelta(this.facing, DMath.atan2(dy, dx))) > CONE) continue;
      other.vx = DMath.cos(this.facing) * SHOVE;
      other.vy = DMath.sin(this.facing) * SHOVE;
      other.stunned = STUN;
      other.blink = STUN;
    }
  }
}
