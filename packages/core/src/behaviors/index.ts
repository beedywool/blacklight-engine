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
  eightDirections: (options: DirectionsOptions) => () => new EightDirections(options),
  fourDirections: (options: DirectionsOptions) => () => new FourDirections(options),
  platformer:
    (options: PlatformerOptions = {}) =>
    () =>
      new Platformer(options),
  gridMovement: (options: GridOptions) => () => new GridMovement(options),
  pointer:
    (options: PointerOptions = {}) =>
    () =>
      new PointerBehavior(options),
  dragAndDrop:
    (options: DragDropOptions = {}) =>
    () =>
      new DragAndDrop(options),
  virtualJoystick:
    (options: JoystickOptions = {}) =>
    () =>
      new VirtualJoystick(options),
  pathFollow: (options: PathOptions) => () => new PathFollow(options),
  patrol: (options: PatrolOptions) => () => new Patrol(options),
  followTarget: (options: FollowTargetOptions) => () => new FollowTarget(options),
  bullet: (options: BulletOptions) => () => new Bullet(options),
  bounce: (options: BounceOptions) => () => new Bounce(options),
  tankRotation: (options: TankOptions) => () => new TankRotation(options),
  sineWave: (options: SineOptions) => () => new SineWave(options),
  anchorToScreen: (options: AnchorOptions) => () => new AnchorToScreen(options),
  wrapAroundScreen:
    (options: { margin?: number } = {}) =>
    () =>
      new WrapAroundScreen(options),
  destroyOutsideLayout:
    (options: { margin?: number } = {}) =>
    () =>
      new DestroyOutsideLayout(options),
  flash:
    (options: FlashOptions = {}) =>
    () =>
      new Flash(options),
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
