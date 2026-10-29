import { Graphics as PixiGraphics } from 'pixi.js';
import { collide } from '../collision/shapes';
import type { GameObject } from '../objects/game-object';
import { clamp, type Point, type Rect } from '../math';
import type { ActionName } from '../register';
import { Behavior } from './behavior';

/** `true` when the object sits in the scene's HUD (screen space). */
function inHud(object: GameObject): boolean {
  for (let node = object.parent; node; node = node.parent)
    if (node === object.scene.hud) return true;
  return false;
}

/** Pointer position in the object's coordinate space (screen for HUD objects, world otherwise). */
export function pointerFor(
  object: GameObject,
): Point & { down: boolean; pressed: boolean; released: boolean } {
  const p = object.scene.pointer;
  return inHud(object)
    ? { ...p.screen, down: p.down, pressed: p.pressed, released: p.released }
    : p;
}

/** `true` when `point` (scene space) is inside the object's hitbox, or its display bounds without one. */
export function hitTest(object: GameObject, point: Point): boolean {
  const shape = object.worldShape();
  if (shape)
    return (
      collide(
        { kind: 'box', rect: { x: point.x, y: point.y, width: 0.01, height: 0.01 } },
        shape,
      ) !== undefined
    );
  const t = object.sceneTransform();
  const cos = Math.cos(-t.rotation);
  const sin = Math.sin(-t.rotation);
  const dx = point.x - t.x;
  const dy = point.y - t.y;
  const local = { x: (dx * cos - dy * sin) / t.scaleX, y: (dx * sin + dy * cos) / t.scaleY };
  return object.getLocalBounds().rectangle.contains(local.x, local.y);
}

export interface PointerOptions {
  onDown?: (object: GameObject) => void;
  onUp?: (object: GameObject) => void;
  /** Down and up on the object. */
  onClick?: (object: GameObject) => void;
  onEnter?: (object: GameObject) => void;
  onLeave?: (object: GameObject) => void;
  /** Drag the object with the pointer. */
  draggable?: boolean;
}

/** Click, hover and drag on an object with mouse or touch. */
export class PointerBehavior extends Behavior<PointerOptions> {
  readonly name: string = 'pointer';
  hovered = false;
  pressed = false;
  dragging = false;
  private grab: Point = { x: 0, y: 0 };

  override update(object: GameObject): void {
    const p = pointerFor(object);
    const over = hitTest(object, p);
    if (over !== this.hovered) {
      this.hovered = over;
      (over ? this.options.onEnter : this.options.onLeave)?.(object);
    }
    if (p.pressed && over) {
      this.pressed = true;
      this.grab = { x: object.x - p.x, y: object.y - p.y };
      this.dragging = !!this.options.draggable;
      this.options.onDown?.(object);
      this.dragStart(object);
    }
    if (this.dragging && p.down) {
      object.x = p.x + this.grab.x;
      object.y = p.y + this.grab.y;
      this.dragMove(object);
    }
    if (p.released && this.pressed) {
      this.pressed = false;
      this.options.onUp?.(object);
      if (over) this.options.onClick?.(object);
      if (this.dragging) {
        this.dragging = false;
        this.dragEnd(object);
      }
    }
  }

  protected dragStart(_object: GameObject): void {}
  protected dragMove(_object: GameObject): void {}
  protected dragEnd(_object: GameObject): void {}
}

export interface DragDropOptions {
  /** Snap to a grid of this size, or to the nearest of these points. */
  snap?: number | Point[];
  /** Snap points only attract within this distance. @defaultValue `Infinity` */
  snapRadius?: number;
  /** Keep the object inside this area. */
  bounds?: Rect;
  /** Objects with this name or tag accept drops; the object returns to its start otherwise. */
  dropOn?: string;
  onDrop?: (object: GameObject, target: GameObject | undefined) => void;
}

/** Drag objects and drop them on a grid, on snap points or on targets (inventories, puzzles). */
export class DragAndDrop extends PointerBehavior {
  override readonly name = 'dragAndDrop';
  private start: Point = { x: 0, y: 0 };
  private readonly drop: DragDropOptions;

  constructor(options: DragDropOptions) {
    super({ draggable: true });
    this.drop = options;
  }

  protected override dragStart(object: GameObject): void {
    this.start = { x: object.x, y: object.y };
    object.zIndex += 1000;
  }

  protected override dragMove(object: GameObject): void {
    const b = this.drop.bounds;
    if (!b) return;
    object.x = clamp(object.x, b.x, b.x + b.width);
    object.y = clamp(object.y, b.y, b.y + b.height);
  }

  protected override dragEnd(object: GameObject): void {
    object.zIndex -= 1000;
    const { snap, snapRadius = Infinity, dropOn } = this.drop;
    if (typeof snap === 'number') {
      object.x = Math.round(object.x / snap) * snap;
      object.y = Math.round(object.y / snap) * snap;
    } else if (snap && snap.length > 0) {
      let best: Point | undefined;
      let bestDistance = snapRadius;
      for (const point of snap) {
        const d = Math.hypot(point.x - object.x, point.y - object.y);
        if (d <= bestDistance) [best, bestDistance] = [point, d];
      }
      if (best) {
        object.x = best.x;
        object.y = best.y;
      }
    }
    let target: GameObject | undefined;
    if (dropOn) {
      target = object.scene
        .findAll(dropOn)
        .find((o) => o !== object && hitTest(o, { x: object.x, y: object.y }));
      if (!target) {
        object.x = this.start.x;
        object.y = this.start.y;
      }
    }
    this.drop.onDrop?.(object, target);
  }
}

export interface JoystickOptions {
  /** Knob travel radius in virtual px. @defaultValue `90` */
  radius?: number;
  /** Screen area where a touch starts the joystick. @defaultValue the left half */
  zone?: Rect;
  /** Actions set while pushed. @defaultValue left/right/up/down */
  actions?: { left?: ActionName; right?: ActionName; up?: ActionName; down?: ActionName };
  /** Player whose actions it drives. @defaultValue `1` */
  player?: number;
  /** Show the joystick at its rest position when not touched. @defaultValue `false` */
  alwaysVisible?: boolean;
}

/**
 * On-screen joystick for touch screens: put it on an object in the `'hud'` layer. It feeds the
 * same actions as the keyboard and gamepads, so movement behaviors work unchanged.
 */
export class VirtualJoystick extends Behavior<JoystickOptions> {
  readonly name = 'virtualJoystick';
  /** Current direction, length 0–1. */
  readonly value: Point = { x: 0, y: 0 };
  private touch: number | undefined;
  private origin: Point = { x: 0, y: 0 };
  private rest: Point = { x: 0, y: 0 };
  private readonly base = new PixiGraphics();
  private readonly knob = new PixiGraphics();

  override attach(object: GameObject): void {
    super.attach(object);
    const radius = this.options.radius ?? 90;
    this.base
      .circle(0, 0, radius)
      .fill({ color: 0xffffff, alpha: 0.12 })
      .stroke({ color: 0xffffff, alpha: 0.4, width: 3 });
    this.knob.circle(0, 0, radius * 0.45).fill({ color: 0xffffff, alpha: 0.5 });
    object.addChild(this.base, this.knob);
    object.visible = !!this.options.alwaysVisible;
    this.rest = { x: object.x, y: object.y };
  }

  override detach(object: GameObject): void {
    this.release(object);
    this.base.destroy();
    this.knob.destroy();
  }

  override update(object: GameObject): void {
    const { touches } = object.game.input;
    const zone = this.options.zone ?? {
      x: 0,
      y: 0,
      width: object.scene.width / 2,
      height: object.scene.height,
    };
    if (this.touch === undefined) {
      for (const [id, point] of touches) {
        if (
          point.x >= zone.x &&
          point.x <= zone.x + zone.width &&
          point.y >= zone.y &&
          point.y <= zone.y + zone.height
        ) {
          this.touch = id;
          this.origin = { ...point };
          object.x = point.x;
          object.y = point.y;
          object.visible = true;
          break;
        }
      }
    }
    const point = this.touch !== undefined ? touches.get(this.touch) : undefined;
    if (!point) {
      if (this.touch !== undefined) this.release(object);
      return;
    }
    const radius = this.options.radius ?? 90;
    let dx = (point.x - this.origin.x) / radius;
    let dy = (point.y - this.origin.y) / radius;
    const length = Math.hypot(dx, dy);
    if (length > 1) {
      dx /= length;
      dy /= length;
    }
    this.value.x = dx;
    this.value.y = dy;
    this.knob.position.set(dx * radius, dy * radius);
    this.setActions(object, dx, dy);
  }

  private release(object: GameObject): void {
    this.touch = undefined;
    this.value.x = this.value.y = 0;
    this.knob.position.set(0, 0);
    this.setActions(object, 0, 0);
    object.visible = !!this.options.alwaysVisible;
    object.teleport(this.rest.x, this.rest.y);
  }

  private setActions(object: GameObject, dx: number, dy: number): void {
    const a = this.options.actions ?? {};
    const virtual = object.game.input.player(this.options.player ?? 1).virtual;
    virtual.set(a.left ?? 'left', Math.max(0, -dx));
    virtual.set(a.right ?? 'right', Math.max(0, dx));
    virtual.set(a.up ?? 'up', Math.max(0, -dy));
    virtual.set(a.down ?? 'down', Math.max(0, dy));
  }
}
