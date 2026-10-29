import type { GameObject } from '../objects/game-object';

/**
 * A reusable piece of behavior attached to game objects: movement, controls, effects. An object
 * can have several; each can be turned off with `enabled`.
 *
 * @example
 * ```ts
 * class Spin extends Behavior<{ speed: number }> {
 *   readonly name = 'spin';
 *   update(object: GameObject, dt: number) {
 *     object.rotation += this.options.speed * dt;
 *   }
 * }
 * export const spin = (options: { speed: number }) => () => new Spin(options);
 * ```
 */
export abstract class Behavior<Options extends object = object, O extends GameObject = GameObject> {
  /** Name used by `object.behavior('name')`. */
  abstract readonly name: string;
  /** Disabled behaviors are not updated. */
  enabled = true;
  /**
   * The behavior moves the object itself (with `object.move`), so the engine does not apply the
   * object's `velocity` on top.
   */
  readonly ownsMovement: boolean = false;
  /** The object it is attached to, set by `attach`. */
  object!: O;

  constructor(readonly options: Options) {}

  /** Called when the behavior is attached, after the object's properties are set. */
  attach(object: O): void {
    this.object = object;
  }

  /** Called at every fixed step, before the object's own `update()`. `dt` is in seconds. */
  update(_object: O, _dt: number): void {}

  /** Called when the behavior is removed or the object destroyed. */
  detach(_object: O): void {}
}

/** Any behavior, whatever its options and object type. */
export interface AnyBehavior {
  readonly name: string;
  enabled: boolean;
  readonly ownsMovement: boolean;
  attach(object: never): void;
  update(object: never, dt: number): void;
  detach(object: never): void;
}

/** Creates a fresh behavior for each object: `static behaviors = [eightDirections({ speed: 240 })]`. */
export type BehaviorSpec = () => AnyBehavior;
