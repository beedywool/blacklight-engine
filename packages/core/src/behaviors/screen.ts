import type { GameObject } from '../objects/game-object';
import { boundsOf } from './movement';
import { Behavior } from './behavior';

export interface AnchorOptions {
  /** Horizontal screen position, 0 (left) to 1 (right). */
  x: number;
  /** Vertical screen position, 0 (top) to 1 (bottom). */
  y: number;
  /** Offset in virtual px. */
  offset?: { x: number; y: number };
}

/** Keeps a world object at a fixed place on screen whatever the camera does. */
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

/** Leaving one edge of the scene brings the object back from the opposite edge (Asteroids). */
export class WrapAroundScreen extends Behavior<{ margin?: number }> {
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

/** Destroys the object once it is fully outside the scene (plus `margin` px). */
export class DestroyOutsideLayout extends Behavior<{ margin?: number }> {
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
