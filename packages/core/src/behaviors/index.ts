import { Fade, Flash, type FadeOptions, type FlashOptions } from './effects';
import { GridMovement, type GridOptions } from './grid';
import {
  Bounce,
  Bullet,
  EightDirections,
  FollowTarget,
  FourDirections,
  PathFollow,
  Patrol,
  SineWave,
  TankRotation,
  type BounceOptions,
  type BulletOptions,
  type DirectionsOptions,
  type FollowTargetOptions,
  type PathOptions,
  type PatrolOptions,
  type SineOptions,
  type TankOptions,
} from './movement';
import { Platformer, type PlatformerOptions } from './platformer';
import {
  DragAndDrop,
  PointerBehavior,
  VirtualJoystick,
  type DragDropOptions,
  type JoystickOptions,
  type PointerOptions,
} from './pointer';
import {
  AnchorToScreen,
  DestroyOutsideLayout,
  WrapAroundScreen,
  type AnchorOptions,
} from './screen';

/**
 * Ready-made behaviors. Each function returns a spec for `static behaviors`; every spawned object
 * gets its own instance.
 *
 * @example
 * ```ts
 * static behaviors = [behaviors.platformer({ jumpStrength: 760 }), behaviors.flash()];
 * ```
 */
export const behaviors = {
  /** Top-down movement in 8 directions from input ({@link EightDirections}). */
  eightDirections: (options: DirectionsOptions) => () => new EightDirections(options),
  /** Top-down movement along one axis at a time ({@link FourDirections}). */
  fourDirections: (options: DirectionsOptions) => () => new FourDirections(options),
  /** Side-view running and jumping with gravity ({@link Platformer}). */
  platformer:
    (options: PlatformerOptions = {}) =>
    () =>
      new Platformer(options),
  /** Cell-by-cell movement with A* paths ({@link GridMovement}). */
  gridMovement: (options: GridOptions) => () => new GridMovement(options),
  /** Hover, press and click callbacks from the mouse or touch ({@link PointerBehavior}). */
  pointer:
    (options: PointerOptions = {}) =>
    () =>
      new PointerBehavior(options),
  /** Drag the object with the pointer ({@link DragAndDrop}). */
  dragAndDrop:
    (options: DragDropOptions = {}) =>
    () =>
      new DragAndDrop(options),
  /** On-screen stick that drives direction actions on touch screens ({@link VirtualJoystick}). */
  virtualJoystick:
    (options: JoystickOptions = {}) =>
    () =>
      new VirtualJoystick(options),
  /** Follows a list of points ({@link PathFollow}). */
  pathFollow: (options: PathOptions) => () => new PathFollow(options),
  /** Walks back and forth ({@link Patrol}). */
  patrol: (options: PatrolOptions) => () => new Patrol(options),
  /** Moves towards an object or a point ({@link FollowTarget}). */
  followTarget: (options: FollowTargetOptions) => () => new FollowTarget(options),
  /** Moves in a straight line or an arc ({@link Bullet}). */
  bullet: (options: BulletOptions) => () => new Bullet(options),
  /** Moves and bounces off solids and the scene edges ({@link Bounce}). */
  bounce: (options: BounceOptions) => () => new Bounce(options),
  /** Turns and drives along its rotation ({@link TankRotation}). */
  tankRotation: (options: TankOptions) => () => new TankRotation(options),
  /** Oscillates a property ({@link SineWave}). */
  sineWave: (options: SineOptions) => () => new SineWave(options),
  /** Keeps the object at a position relative to the screen ({@link AnchorToScreen}). */
  anchorToScreen: (options: AnchorOptions) => () => new AnchorToScreen(options),
  /** Leaving one side of the scene re-enters from the other; `margin` in px ({@link WrapAroundScreen}). */
  wrapAroundScreen:
    (options: { margin?: number } = {}) =>
    () =>
      new WrapAroundScreen(options),
  /** Destroys the object once it is outside the scene bounds by more than `margin` px ({@link DestroyOutsideLayout}). */
  destroyOutsideLayout:
    (options: { margin?: number } = {}) =>
    () =>
      new DestroyOutsideLayout(options),
  /** Blinks the object on `start(ms)` ({@link Flash}). */
  flash:
    (options: FlashOptions = {}) =>
    () =>
      new Flash(options),
  /** Fades the object in and/or out ({@link Fade}). */
  fade:
    (options: FadeOptions = {}) =>
    () =>
      new Fade(options),
};

export {
  AnchorToScreen,
  Bounce,
  Bullet,
  DestroyOutsideLayout,
  DragAndDrop,
  EightDirections,
  Fade,
  Flash,
  FollowTarget,
  FourDirections,
  GridMovement,
  PathFollow,
  Patrol,
  Platformer,
  PointerBehavior,
  SineWave,
  TankRotation,
  VirtualJoystick,
  WrapAroundScreen,
};
export type {
  AnchorOptions,
  BounceOptions,
  BulletOptions,
  DirectionsOptions,
  DragDropOptions,
  FadeOptions,
  FlashOptions,
  FollowTargetOptions,
  GridOptions,
  JoystickOptions,
  PathOptions,
  PatrolOptions,
  PlatformerOptions,
  PointerOptions,
  SineOptions,
  TankOptions,
};
export { Behavior, type AnyBehavior, type BehaviorSpec } from './behavior';
export { findPath, type Cell } from './grid';
export { facingOf, turnTowards, boundsOf, type Facing } from './movement';
export { hitTest, pointerFor } from './pointer';
export type { PlatformerState } from './platformer';
