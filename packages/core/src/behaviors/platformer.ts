import type { GameObject } from '../objects/game-object';
import { approach } from '../math';
import type { ActionName } from '../register';
import { Behavior } from './behavior';

export interface PlatformerOptions {
  /** Top running speed in px/s. @defaultValue `320` */
  speed?: number;
  /** px/s² on the ground. @defaultValue `2400` */
  acceleration?: number;
  /** px/s² to stop on the ground. @defaultValue `2800` */
  deceleration?: number;
  /** Share of acceleration available in the air, 0–1. @defaultValue `0.8` */
  airControl?: number;
  /** px/s². @defaultValue `2200` */
  gravity?: number;
  /** Initial jump speed in px/s. @defaultValue `820` */
  jumpStrength?: number;
  /** Maximum falling speed in px/s. @defaultValue `1400` */
  maxFall?: number;
  /** Jumping is still allowed this long after walking off a ledge (ms). @defaultValue `100` */
  coyoteTime?: number;
  /** A jump pressed this long before landing still happens (ms). @defaultValue `120` */
  jumpBuffer?: number;
  /** Upward speed is multiplied by this when jump is released early (variable jump height). @defaultValue `0.45` */
  jumpCut?: number;
  /** Extra jumps in the air. @defaultValue `0` */
  airJumps?: number;
  /** Steepest walkable slope, in px up per px sideways. @defaultValue `1` (45°) */
  climb?: number;
  actions?: { left?: ActionName; right?: ActionName; jump?: ActionName };
}

export type PlatformerState = 'idle' | 'run' | 'jump' | 'fall';

/**
 * Side-view movement with gravity: running, variable jumps, coyote time, jump buffering, slopes,
 * one-way platforms (`collision: { jumpThru: true }`) and moving platforms (solid objects that
 * move carry what stands on them). `state` and `facing` drive animations.
 *
 * @example
 * ```ts
 * static behaviors = [behaviors.platformer({ speed: 300, jumpStrength: 760 })];
 * update() {
 *   const move = this.behavior<Platformer>('platformer')!;
 *   this.play(move.state);
 *   this.flipX = move.facing === 'left';
 * }
 * ```
 */
export class Platformer extends Behavior<PlatformerOptions> {
  readonly name = 'platformer';
  override readonly ownsMovement = true;
  onGround = false;
  state: PlatformerState = 'idle';
  facing: 'left' | 'right' = 'right';
  /** Solid object stood on, if any. */
  platform: GameObject | undefined;
  private platformAt: { x: number; y: number } | undefined;
  private coyote = 0;
  private buffer = 0;
  private airJumpsLeft = 0;
  private jumping = false;

  /** Makes the object jump now (springs, enemies bounced on). */
  jump(strength = this.options.jumpStrength ?? 820): void {
    this.object.velocity.y = -strength;
    this.onGround = false;
    this.coyote = 0;
    this.jumping = true;
  }

  override update(object: GameObject, dt: number): void {
    const o = this.options;
    const a = o.actions ?? {};
    const input = object.input;
    const v = object.velocity;
    const ms = dt * 1000;

    // Ride moving platforms by their displacement since last step.
    if (this.platform?.alive && this.platformAt) {
      const dx = this.platform.x - this.platformAt.x;
      const dy = this.platform.y - this.platformAt.y;
      if (dx !== 0 || dy !== 0) object.move(dx, dy);
    }

    const direction = input.axis(a.left ?? 'left', a.right ?? 'right');
    if (direction !== 0) this.facing = direction < 0 ? 'left' : 'right';
    const control = this.onGround ? 1 : (o.airControl ?? 0.8);
    const rate = (direction !== 0 ? (o.acceleration ?? 2400) : (o.deceleration ?? 2800)) * control;
    v.x = approach(v.x, direction * (o.speed ?? 320), rate * dt);

    v.y = Math.min(v.y + (o.gravity ?? 2200) * dt, o.maxFall ?? 1400);

    const jump = a.jump ?? 'jump';
    this.buffer = input.pressed(jump) ? (o.jumpBuffer ?? 120) : Math.max(0, this.buffer - ms);
    this.coyote = this.onGround ? (o.coyoteTime ?? 100) : Math.max(0, this.coyote - ms);
    if (this.onGround) this.airJumpsLeft = o.airJumps ?? 0;
    if (this.buffer > 0) {
      if (this.coyote > 0) {
        this.buffer = 0;
        this.jump();
      } else if (this.airJumpsLeft > 0) {
        this.buffer = 0;
        this.airJumpsLeft--;
        this.jump();
      }
    }
    if (this.jumping && v.y < 0 && input.released(jump)) {
      v.y *= o.jumpCut ?? 0.45;
      this.jumping = false;
    }

    const wasOnGround = this.onGround;
    const climb = o.climb ?? 1;
    const horizontal = object.move(v.x * dt, 0, wasOnGround ? climb : 0);
    if (horizontal.blockedX) v.x = 0;
    const vertical = object.move(0, v.y * dt);
    if (vertical.blockedY) {
      if (v.y > 0) this.jumping = false;
      v.y = 0;
    }
    // Stay on the ground when walking down a slope instead of hopping off it.
    if (wasOnGround && v.y >= 0 && !object.scene.collisions.blockedAt(object, 0, 1)) {
      const snap = Math.ceil(Math.abs(v.x * dt) * climb) + 1;
      for (let down = 1; down <= snap; down++) {
        if (object.scene.collisions.blockedAt(object, 0, down)) {
          object.move(0, down - 1);
          break;
        }
      }
    }
    this.onGround = v.y >= 0 && object.scene.collisions.blockedAt(object, 0, 1);
    this.platform = this.onGround ? this.findPlatform(object) : undefined;
    this.platformAt = this.platform ? { x: this.platform.x, y: this.platform.y } : undefined;

    this.state = !this.onGround ? (v.y < 0 ? 'jump' : 'fall') : Math.abs(v.x) > 1 ? 'run' : 'idle';
  }

  private findPlatform(object: GameObject): GameObject | undefined {
    const shape = object.worldShape();
    if (!shape) return undefined;
    const below = object.move(0, 1);
    object.y -= below.blockedY ? 0 : 1;
    return below.touched.find((o) => o !== object);
  }
}
