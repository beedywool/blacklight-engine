import { DMath, Graphics, angleDelta, type GameObject } from '@blacklight/core';
import {
  ACCELERATION,
  COLORS,
  FRICTION,
  REACH,
  RING,
  SHOVE,
  SHOVE_COOLDOWN,
  STUN,
  WRESTLER_RADIUS,
} from '../../rules';

/** One sumo wrestler, steered by `input.player(this.player)`. */
export default class Wrestler extends Graphics {
  static override hitbox = { type: 'circle' as const, radius: WRESTLER_RADIUS };
  static override tags = ['wrestler'];

  /** Direction the wrestler faces, radians. */
  facing = 0;
  /** Steps until the next shove. */
  cooldown = 0;
  /** Steps left without control after being shoved. */
  stunned = 0;
  /** Shoves landed. */
  shoves = 0;
  /** Contacts with other wrestlers (onCollide). */
  bumps = 0;

  override create(): void {
    this.paint();
  }

  override onRestore(): void {
    this.paint();
  }

  private paint(): void {
    const color = COLORS[(this.player - 1) % COLORS.length]!;
    this.draw.clear();
    this.draw.circle(0, 0, WRESTLER_RADIUS).fill(color);
    this.draw.rect(WRESTLER_RADIUS - 4, -3, 10, 6).fill(0x080808);
  }

  override update(): void {
    const dt = this.game.time.dt;
    const input = this.input;
    if (this.cooldown > 0) this.cooldown--;
    if (this.stunned > 0) {
      this.stunned--;
    } else {
      const ax = input.axis('left', 'right');
      const ay = input.axis('up', 'down');
      if (ax !== 0 || ay !== 0) {
        this.facing = DMath.atan2(ay, ax);
        this.velocity.x += DMath.cos(this.facing) * ACCELERATION * dt;
        this.velocity.y += DMath.sin(this.facing) * ACCELERATION * dt;
      }
      if (input.pressed('action') && this.cooldown === 0) this.shove();
    }
    this.velocity.x *= FRICTION;
    this.velocity.y *= FRICTION;
    this.rotation = this.facing;
    // Wrestlers do not overlap: each pushes itself out by half the depth.
    for (const [other, p] of this.scene.collisions.contactsOf(this)) {
      if (!other.is('wrestler')) continue;
      this.x += (p.nx * p.depth) / 2;
      this.y += (p.ny * p.depth) / 2;
    }
    if (DMath.hypot(this.x - RING.x, this.y - RING.y) > RING.radius) this.destroy();
  }

  private shove(): void {
    this.cooldown = SHOVE_COOLDOWN;
    for (const other of this.scene.findAll<Wrestler>('wrestler')) {
      if (other === this) continue;
      const dx = other.x - this.x;
      const dy = other.y - this.y;
      if (DMath.hypot(dx, dy) > REACH) continue;
      if (Math.abs(angleDelta(this.facing, DMath.atan2(dy, dx))) > 1) continue;
      other.velocity.set(DMath.cos(this.facing) * SHOVE, DMath.sin(this.facing) * SHOVE);
      other.stunned = STUN;
      this.shoves++;
    }
  }

  override onCollide(other: GameObject): void {
    if (other.is('wrestler')) this.bumps++;
  }
}
