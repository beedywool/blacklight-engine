import type { GameObject } from '../objects/game-object';
import { boundsOf } from './movement';
import { Behavior } from './behavior';

/** Options of {@link AnchorToScreen} (`behaviors.anchorToScreen`). */
export interface AnchorOptions {
  /** Horizontal screen position, 0 (left) to 1 (right). */
  x: number;
  /** Vertical screen position, 0 (top) to 1 (bottom). */
  y: number;
  /** Offset in virtual px. */
  offset?: {
    /** Horizontal offset in virtual px. */
    x: number;
    /** Vertical offset in virtual px. */
    y: number;
  };
}

/**
 * Keeps a world object at a fixed place on screen whatever the camera does. Objects in the
 * `'hud'` layer are already fixed; use it for world objects that must stay in view (a boss health
 * bar that still collides, a pointer target).
 *
 * @example
 * ```ts
 * import { Sprite, behaviors } from '@blacklight/core';
 *
 * export class Compass extends Sprite {
 *   static behaviors = [behaviors.anchorToScreen({ x: 1, y: 0, offset: { x: -48, y: 48 } })];
 * }
 * ```
 */
export class AnchorToScreen extends Behavior<AnchorOptions> {
  readonly name = 'anchorToScreen';
  override readonly ownsMovement = true;

  override update(object: GameObject): void {
    const scene = object.scene;
    const world = scene.camera.toWorld({
      x: this.options.x * scene.width + (this.options.offset?.x ?? 0),
      y: this.options.y * scene.height + (this.options.offset?.y ?? 0),
    });
    object.teleport(world.x, world.y);
  }
}

/**
 * Leaving one edge of the scene brings the object back from the opposite edge (Asteroids).
 *
 * @example
 * ```ts
 * import { Sprite, behaviors } from '@blacklight/core';
 *
 * export class Asteroid extends Sprite {
 *   static behaviors = [behaviors.bounce({ speed: 90, edges: false }), behaviors.wrapAroundScreen()];
 * }
 * ```
 */
export class WrapAroundScreen extends Behavior<{
  /** Distance in px beyond the edge before the object wraps. @defaultValue `0` */
  margin?: number;
}> {
  readonly name = 'wrapAroundScreen';

  override update(object: GameObject): void {
    const b = object.scene.bounds;
    const m = this.options.margin ?? 0;
    const r = boundsOf(object);
    if (r.x > b.x + b.width + m) object.teleport(object.x - (b.width + r.width + m * 2), object.y);
    else if (r.x + r.width < b.x - m)
      object.teleport(object.x + (b.width + r.width + m * 2), object.y);
    if (r.y > b.y + b.height + m)
      object.teleport(object.x, object.y - (b.height + r.height + m * 2));
    else if (r.y + r.height < b.y - m)
      object.teleport(object.x, object.y + (b.height + r.height + m * 2));
  }
}

/**
 * Destroys the object once it is fully outside the scene (plus `margin` px), so stray bullets and
 * debris do not pile up.
 *
 * @example
 * ```ts
 * import { Sprite, behaviors } from '@blacklight/core';
 *
 * export class Laser extends Sprite {
 *   static behaviors = [behaviors.bullet({ speed: 900 }), behaviors.destroyOutsideLayout()];
 * }
 * ```
 */
export class DestroyOutsideLayout extends Behavior<{
  /** Distance in px beyond the scene bounds before the object is destroyed. @defaultValue `64` */
  margin?: number;
}> {
  readonly name = 'destroyOutsideLayout';

  override update(object: GameObject): void {
    const b = object.scene.bounds;
    const m = this.options.margin ?? 64;
    const r = boundsOf(object);
    if (
      r.x > b.x + b.width + m ||
      r.x + r.width < b.x - m ||
      r.y > b.y + b.height + m ||
      r.y + r.height < b.y - m
    ) {
      object.destroy();
    }
  }
}
