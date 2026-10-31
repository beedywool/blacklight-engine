import { DMath } from '../dmath';
import type { GameObject } from '../objects/game-object';
import { shapeBounds } from '../collision/shapes';
import { angleDelta, approach, DEG, Vector2, type Point, type Rect } from '../math';
import type { ActionName } from '../register';
import { Behavior } from './behavior';

/** Facing names used for directional animations (`walk-upleft`). */
export type Facing =
  'right' | 'downright' | 'down' | 'downleft' | 'left' | 'upleft' | 'up' | 'upright';
const FACINGS: Facing[] = [
  'right',
  'downright',
  'down',
  'downleft',
  'left',
  'upleft',
  'up',
  'upright',
];

/**
 * Closest of the 8 facings for a direction, to pick a directional animation.
 *
 * @example
 * ```ts
 * import { facingOf } from '@blacklight/core';
 *
 * // In update(): `walk-upleft`, `walk-down`…
 * if (this.velocity.length > 0) this.play(`walk-${facingOf(this.velocity.x, this.velocity.y)}`);
 * ```
 */
export function facingOf(x: number, y: number): Facing {
  const index = Math.round(DMath.atan2(y, x) / (Math.PI / 4));
  return FACINGS[(index + 8) % 8]!;
}

/** Actions that move in each direction; the defaults are the actions of the same name. */
export interface DirectionActions {
  /** @defaultValue `'left'` */
  left?: ActionName;
  /** @defaultValue `'right'` */
  right?: ActionName;
  /** @defaultValue `'up'` */
  up?: ActionName;
  /** @defaultValue `'down'` */
  down?: ActionName;
}

/** Options of {@link EightDirections} and {@link FourDirections}. */
export interface DirectionsOptions {
  /** Top speed in px/s. */
  speed: number;
  /** px/s² to reach top speed; instant when omitted. */
  acceleration?: number;
  /** px/s² to stop; instant when omitted. */
  deceleration?: number;
  /** Actions read from the object's player. @defaultValue left/right/up/down */
  actions?: DirectionActions;
}

/**
 * Top-down movement driven by input. `facing` gives the last direction for animations.
 *
 * @example
 * ```ts
 * import { EightDirections, Sprite, behaviors } from '@blacklight/core';
 *
 * export class Player extends Sprite {
 *   static behaviors = [behaviors.eightDirections({ speed: 240, acceleration: 1800 })];
 *   update() {
 *     const facing = this.behavior(EightDirections)!.facing;
 *     this.play(this.velocity.length > 0 ? `walk-${facing}` : `idle-${facing}`);
 *   }
 * }
 * ```
 */
export class EightDirections extends Behavior<DirectionsOptions> {
  readonly name: string = 'eightDirections';
  override readonly ownsMovement = true;
  /** Last direction moved. */
  facing: Facing = 'down';
  /** Moves along one axis at a time ({@link FourDirections}). */
  protected readonly fourWay: boolean = false;

  override update(object: GameObject, dt: number): void {
    const a = this.options.actions ?? {};
    let dir = object.input.vector(
      a.left ?? 'left',
      a.right ?? 'right',
      a.up ?? 'up',
      a.down ?? 'down',
    );
    if (this.fourWay)
      dir =
        Math.abs(dir.x) >= Math.abs(dir.y)
          ? new Vector2(Math.sign(dir.x), 0)
          : new Vector2(0, Math.sign(dir.y));
    const { speed, acceleration, deceleration } = this.options;
    const v = object.velocity;
    const moving = dir.x !== 0 || dir.y !== 0;
    const rate = moving ? acceleration : deceleration;
    const tx = dir.x * speed;
    const ty = dir.y * speed;
    if (rate === undefined) v.set(tx, ty);
    else v.set(approach(v.x, tx, rate * dt), approach(v.y, ty, rate * dt));
    if (moving) this.facing = facingOf(dir.x, dir.y);
    const result = object.move(v.x * dt, v.y * dt);
    if (result.blockedX) v.x = 0;
    if (result.blockedY) v.y = 0;
  }
}

/**
 * Like {@link EightDirections}, one axis at a time (grid-like games, classic RPGs).
 *
 * @example
 * ```ts
 * import { Sprite, behaviors } from '@blacklight/core';
 *
 * export class Villager extends Sprite {
 *   static behaviors = [behaviors.fourDirections({ speed: 120 })];
 * }
 * ```
 */
export class FourDirections extends EightDirections {
  override readonly name = 'fourDirections';
  protected override readonly fourWay = true;
}

/** Options of {@link TankRotation} (`behaviors.tankRotation`). */
export interface TankOptions {
  /** Forward speed in px/s. */
  speed: number;
  /** Turn speed in degrees per second. */
  turnSpeed: number;
  /** forward = up, backward = down, turn = left/right by default. */
  actions?: {
    /** Drives forward. @defaultValue `'up'` */
    forward?: ActionName;
    /** Drives backward. @defaultValue `'down'` */
    backward?: ActionName;
    /** Turns counterclockwise. @defaultValue `'left'` */
    left?: ActionName;
    /** Turns clockwise. @defaultValue `'right'` */
    right?: ActionName;
  };
}

/**
 * Turns with left/right and drives along its rotation with up/down (tanks, cars, ships).
 *
 * @example
 * ```ts
 * import { Sprite, behaviors } from '@blacklight/core';
 *
 * export class Tank extends Sprite {
 *   static behaviors = [behaviors.tankRotation({ speed: 160, turnSpeed: 120 })];
 * }
 * ```
 */
export class TankRotation extends Behavior<TankOptions> {
  readonly name = 'tankRotation';
  override readonly ownsMovement = true;

  override update(object: GameObject, dt: number): void {
    const a = this.options.actions ?? {};
    const input = object.input;
    object.rotation +=
      input.axis(a.left ?? 'left', a.right ?? 'right') * this.options.turnSpeed * DEG * dt;
    const drive = input.axis(a.backward ?? 'down', a.forward ?? 'up') * this.options.speed;
    object.velocity.set(DMath.cos(object.rotation) * drive, DMath.sin(object.rotation) * drive);
    object.move(object.velocity.x * dt, object.velocity.y * dt);
  }
}

/** Options of {@link Bullet} (`behaviors.bullet`). */
export interface BulletOptions {
  /** px/s. */
  speed: number;
  /** Direction in degrees (0 = right, 90 = down); defaults to the object's rotation. */
  angle?: number;
  /** px/s² added to the speed. */
  acceleration?: number;
  /** Downward acceleration in px/s² (arrows, grenades). */
  gravity?: number;
  /** Rotate the object along its path. */
  rotate?: boolean;
  /** Destroy when hitting a solid. @defaultValue `true` */
  destroyOnSolid?: boolean;
}

/**
 * Moves in a straight line (or an arc with gravity), and is destroyed when it hits a solid.
 *
 * @example
 * ```ts
 * import { Sprite, behaviors } from '@blacklight/core';
 *
 * export class Arrow extends Sprite {
 *   static behaviors = [behaviors.bullet({ speed: 600, gravity: 400, rotate: true })];
 * }
 * // this.spawn(Arrow, { x, y, rotation: aim }) flies along `aim`.
 * ```
 */
export class Bullet extends Behavior<BulletOptions> {
  readonly name = 'bullet';
  override readonly ownsMovement = true;

  override attach(object: GameObject): void {
    super.attach(object);
    const angle = this.options.angle !== undefined ? this.options.angle * DEG : object.rotation;
    object.velocity.set(
      DMath.cos(angle) * this.options.speed,
      DMath.sin(angle) * this.options.speed,
    );
  }

  override update(object: GameObject, dt: number): void {
    const v = object.velocity;
    if (this.options.acceleration) {
      const length = v.length;
      if (length > 0) v.scale((length + this.options.acceleration * dt) / length);
    }
    if (this.options.gravity) v.y += this.options.gravity * dt;
    if (this.options.rotate) object.rotation = v.angle;
    const result = object.move(v.x * dt, v.y * dt);
    if ((result.blockedX || result.blockedY) && this.options.destroyOnSolid !== false)
      object.destroy();
  }
}

/** Options of {@link Bounce} (`behaviors.bounce`). */
export interface BounceOptions {
  /** px/s. */
  speed: number;
  /** Initial direction in degrees (0 = right, 90 = down). @defaultValue `45` */
  angle?: number;
  /** Bounce off the scene edges too. @defaultValue `true` */
  edges?: boolean;
}

/**
 * Moves and bounces off solids and the scene edges (balls, pucks).
 *
 * @example
 * ```ts
 * import { Sprite, behaviors } from '@blacklight/core';
 *
 * export class Ball extends Sprite {
 *   static behaviors = [behaviors.bounce({ speed: 300, angle: 30 })];
 * }
 * ```
 */
export class Bounce extends Behavior<BounceOptions> {
  readonly name = 'bounce';
  override readonly ownsMovement = true;

  override attach(object: GameObject): void {
    super.attach(object);
    const angle = (this.options.angle ?? 45) * DEG;
    object.velocity.set(
      DMath.cos(angle) * this.options.speed,
      DMath.sin(angle) * this.options.speed,
    );
  }

  override update(object: GameObject, dt: number): void {
    const v = object.velocity;
    const result = object.move(v.x * dt, v.y * dt);
    if (result.blockedX) v.x = -v.x;
    if (result.blockedY) v.y = -v.y;
    if (this.options.edges === false) return;
    const r = boundsOf(object);
    const b = object.scene.bounds;
    if ((r.x < b.x && v.x < 0) || (r.x + r.width > b.x + b.width && v.x > 0)) v.x = -v.x;
    if ((r.y < b.y && v.y < 0) || (r.y + r.height > b.y + b.height && v.y > 0)) v.y = -v.y;
  }
}

/**
 * Scene-space bounds of an object's hitbox (its position when it has none).
 *
 * @example
 * ```ts
 * import { boundsOf } from '@blacklight/core';
 *
 * // Is the player's hitbox entirely above the water line?
 * const r = boundsOf(player);
 * const dry = r.y + r.height < waterY;
 * ```
 */
export function boundsOf(object: GameObject): Rect {
  const shape = object.worldShape();
  return shape ? shapeBounds(shape) : { x: object.x, y: object.y, width: 0, height: 0 };
}

/** Options of {@link FollowTarget} (`behaviors.followTarget`). */
export interface FollowTargetOptions {
  /** Object or function giving the point to follow. */
  target: GameObject | (() => Point | undefined);
  /** px/s. */
  speed: number;
  /** Stops this close to the target. @defaultValue `0` */
  stopDistance?: number;
  /** Turn to face the target. */
  rotate?: boolean;
}

/**
 * Moves towards a target (homing enemies, pets, missiles). It stops when the target object is
 * destroyed or the function returns `undefined`.
 *
 * @example
 * ```ts
 * import { FollowTarget, Sprite } from '@blacklight/core';
 *
 * export class Pet extends Sprite {
 *   create() {
 *     const owner = this.scene.find('Player')!;
 *     this.addBehavior(new FollowTarget({ target: owner, speed: 180, stopDistance: 40 }));
 *   }
 * }
 * ```
 */
export class FollowTarget extends Behavior<FollowTargetOptions> {
  readonly name = 'followTarget';
  override readonly ownsMovement = true;

  override update(object: GameObject, dt: number): void {
    const t = this.options.target;
    const point = typeof t === 'function' ? t() : t.alive ? t : undefined;
    if (!point) {
      object.velocity.set(0, 0);
      return;
    }
    const dx = point.x - object.x;
    const dy = point.y - object.y;
    const distance = DMath.hypot(dx, dy);
    const stop = this.options.stopDistance ?? 0;
    if (distance <= stop) {
      object.velocity.set(0, 0);
      return;
    }
    const step = Math.min(this.options.speed * dt, distance - stop);
    object.velocity.set((dx / distance) * this.options.speed, (dy / distance) * this.options.speed);
    if (this.options.rotate) object.rotation = DMath.atan2(dy, dx);
    object.move((dx / distance) * step, (dy / distance) * step);
  }
}

/** Options of {@link PathFollow} (`behaviors.pathFollow`). */
export interface PathOptions {
  /** Points to visit, in scene coordinates. */
  points: Point[];
  /** px/s. */
  speed: number;
  /** `'loop'` back to the first point, `'pingpong'` back and forth, `'once'` stops at the end. @defaultValue `'once'` */
  mode?: 'once' | 'loop' | 'pingpong';
  /** Rotate along the path. */
  rotate?: boolean;
  /** Called when a `'once'` path ends. */
  onComplete?: (object: GameObject) => void;
}

/**
 * Follows a list of points at a constant speed (platforms, patrol routes, conveyor items).
 *
 * @example
 * ```ts
 * import { Sprite, behaviors } from '@blacklight/core';
 *
 * export class Platform extends Sprite {
 *   static collision = { solid: true };
 *   static behaviors = [
 *     behaviors.pathFollow({ points: [{ x: 200, y: 400 }, { x: 600, y: 400 }], speed: 80, mode: 'pingpong' }),
 *   ];
 * }
 * ```
 */
export class PathFollow extends Behavior<PathOptions> {
  readonly name = 'pathFollow';
  override readonly ownsMovement = true;
  /** Index of the point being approached. */
  target = 0;
  /** `true` once a `'once'` path reached its last point. */
  finished = false;
  private direction = 1;

  override update(object: GameObject, dt: number): void {
    const { points, speed, mode = 'once' } = this.options;
    if (this.finished || points.length === 0) return;
    let budget = speed * dt;
    while (budget > 0 && !this.finished) {
      const p = points[this.target]!;
      const dx = p.x - object.x;
      const dy = p.y - object.y;
      const distance = DMath.hypot(dx, dy);
      if (distance > 0 && this.options.rotate) object.rotation = DMath.atan2(dy, dx);
      if (distance > budget) {
        object.x += (dx / distance) * budget;
        object.y += (dy / distance) * budget;
        object.velocity.set((dx / distance) * speed, (dy / distance) * speed);
        return;
      }
      object.x = p.x;
      object.y = p.y;
      budget -= distance;
      const next = this.target + this.direction;
      if (next >= 0 && next < points.length) this.target = next;
      else if (mode === 'loop') this.target = 0;
      else if (mode === 'pingpong' && points.length > 1) {
        this.direction = -this.direction;
        this.target += this.direction;
      } else {
        this.finished = true;
        object.velocity.set(0, 0);
        this.options.onComplete?.(object);
      }
    }
  }
}

/** Options of {@link Patrol} (`behaviors.patrol`). */
export interface PatrolOptions {
  /** Distance to walk each way from the start, in px. */
  distance: number;
  /** px/s. */
  speed: number;
  /** Axis to walk along. @defaultValue `'x'` */
  axis?: 'x' | 'y';
  /** Pause at each end, ms. */
  wait?: number;
}

/**
 * Walks back and forth, turning around at the ends or when blocked (guards, enemies).
 *
 * @example
 * ```ts
 * import { Patrol, Sprite, behaviors } from '@blacklight/core';
 *
 * export class Guard extends Sprite {
 *   static behaviors = [behaviors.patrol({ distance: 160, speed: 60, wait: 800 })];
 *   update() {
 *     this.flipX = this.behavior(Patrol)!.direction < 0;
 *   }
 * }
 * ```
 */
export class Patrol extends Behavior<PatrolOptions> {
  readonly name = 'patrol';
  override readonly ownsMovement = true;
  /** 1 or −1. */
  direction = 1;
  private origin = 0;
  private waiting = 0;

  override attach(object: GameObject): void {
    super.attach(object);
    this.origin = this.options.axis === 'y' ? object.y : object.x;
  }

  override update(object: GameObject, dt: number): void {
    if (this.waiting > 0) {
      this.waiting -= dt * 1000;
      object.velocity.set(0, 0);
      return;
    }
    const vertical = this.options.axis === 'y';
    const step = this.direction * this.options.speed * dt;
    const result = vertical ? object.move(0, step) : object.move(step, 0);
    object.velocity.set(
      vertical ? 0 : this.direction * this.options.speed,
      vertical ? this.direction * this.options.speed : 0,
    );
    const position = vertical ? object.y : object.x;
    const blocked = vertical ? result.blockedY : result.blockedX;
    if (blocked || Math.abs(position - this.origin) >= this.options.distance) {
      this.direction = -this.direction;
      this.waiting = this.options.wait ?? 0;
    }
  }
}

/** Options of {@link SineWave} (`behaviors.sineWave`). */
export interface SineOptions {
  /** Property to oscillate. @defaultValue `'y'` */
  property?: 'x' | 'y' | 'alpha' | 'angle' | 'scale';
  /** Half the range: px, alpha, degrees or scale. */
  amplitude: number;
  /** Seconds per cycle. @defaultValue `1` */
  period?: number;
  /** Start offset, 0–1 of a cycle. */
  phase?: number;
}

/**
 * Oscillates a property (floating pickups, breathing UI). It adds to the property, so the object
 * can move by other means at the same time.
 *
 * @example
 * ```ts
 * import { Sprite, behaviors } from '@blacklight/core';
 *
 * export class Coin extends Sprite {
 *   static behaviors = [behaviors.sineWave({ property: 'y', amplitude: 6, period: 1.2 })];
 * }
 * ```
 */
export class SineWave extends Behavior<SineOptions> {
  readonly name = 'sineWave';
  private time = 0;
  private applied = 0;

  override update(object: GameObject, dt: number): void {
    this.time += dt;
    const { amplitude, period = 1, phase = 0, property = 'y' } = this.options;
    const value = amplitude * DMath.sin((this.time / period + phase) * Math.PI * 2);
    const delta = value - this.applied;
    this.applied = value;
    switch (property) {
      case 'x':
        object.x += delta;
        break;
      case 'y':
        object.y += delta;
        break;
      case 'alpha':
        object.alpha += delta;
        break;
      case 'angle':
        object.rotation += delta * DEG;
        break;
      case 'scale':
        object.scale.set(object.scale.x + delta, object.scale.y + delta);
        break;
    }
  }
}

/**
 * Turns `object.rotation` toward `angle` (radians, like `rotation`) at most `degreesPerSecond`;
 * helper for turrets.
 *
 * @example
 * ```ts
 * turnTowards(this, Math.atan2(target.y - this.y, target.x - this.x), 180, dt);
 * ```
 */
export function turnTowards(
  object: GameObject,
  angle: number,
  degreesPerSecond: number,
  dt: number,
): void {
  const max = degreesPerSecond * DEG * dt;
  const delta = angleDelta(object.rotation, angle);
  object.rotation += Math.abs(delta) <= max ? delta : Math.sign(delta) * max;
}
