export {
  ConfigError,
  defineConfig,
  resolveConfig,
  type GameConfig,
  type ResolutionConfig,
  type ResolutionMode,
  type ResolvedGameConfig,
} from './config';
export {
  Game,
  createGame,
  type CreateGameOptions,
  type GameEvents,
  type GameTime,
  type GotoOptions,
  type LoadingScreen,
  type SceneUi,
  type UiScreenHandle,
  type UiHost,
  BAR_LOADING_SCREEN,
  type Transition,
} from './game';
export {
  Scene,
  type ObjectSnapshot,
  type SceneAudio,
  type ScenePointer,
  type SceneSnapshot,
} from './scene';
export { scenesFromGlob, type SceneClass, type SceneLoader } from './scenes';
export { objectsFromGlob, pascalCase, type ObjectLoader, type ObjectRegistry } from './registry';
export type {
  ActionName,
  AnimationName,
  AssetKey,
  ObjectName,
  Register,
  SceneName,
} from './register';

// Objects
export { GameObject, type GameObjectClass, type SpawnProps } from './objects/game-object';
export { AnimatedSprite, Sprite } from './objects/sprite';
export { Container, Graphics, Text, Video, type TextOptions } from './objects/basic';
export { Particles, type EmitterOptions } from './objects/particles';
export { TilemapLayer, type TiledMap, type TilemapData, type Tileset } from './objects/tilemap';

// Behaviors
export * from './behaviors/index';

// Animation
export {
  Animator,
  findFallback,
  resolveAnimations,
  type AnimationDef,
  type AnimationFile,
  type AnimationFileInput,
  type FrameOverride,
  type ResolvedAnimation,
} from './anim/animator';
export {
  gridSheet,
  parseAseprite,
  parseGridName,
  type AsepriteJson,
  type GridSpec,
  type Sheet,
  type SheetFrame,
  type SheetTag,
} from './anim/sheets';

export { SheetCache, type LoadedSheet } from './anim/sheet-cache';

// Collisions
export {
  collide,
  shapeBounds,
  type HitboxSpec,
  type Penetration,
  type PixelMask,
  type WorldShape,
} from './collision/shapes';
export {
  CollisionWorld,
  type CollisionSpec,
  type CollisionState,
  type Contact,
  type MoveResult,
  type RaycastHit,
  type Side,
  type SolidProvider,
} from './collision/world';

// Input
export {
  InputManager,
  PlayerInput,
  type Device,
  type InputConfig,
  type InputEvents,
  type PointerState,
} from './input/input';
export { DEFAULT_ACTIONS, bindingLabel, parseBinding, type Binding } from './input/bindings';
export { PAD_BUTTONS, type PadButton, type PadState } from './input/gamepad';

// Systems
export { AssetStore, assetKey, resolveProjectPath, type AssetManifest } from './assets';
export { AudioManager, type Bus, type PlayOptions, type SoundHandle } from './audio';
export { Camera, type FollowOptions } from './camera';
export { Disposables, EventBus, type EventMap, type Unsubscribe } from './events';
export { FixedStep } from './loop';
export { Random } from './random';
export { Settings } from './settings';
export {
  WebPlatform,
  type Platform,
  type PlatformFiles,
  type PlatformName,
  type WebFallback,
} from './platform';
export { Timers } from './timers';
export { Tween, Tweens, type EaseName, type SpringOptions, type TweenOptions } from './tween';
export { computeViewport, type Viewport } from './viewport';

// Utilities
export {
  DEG,
  Vector2,
  angleDelta,
  approach,
  clamp,
  distance,
  lerp,
  rectsOverlap,
  type Point,
  type Rect,
} from './math';
export { DMath } from './dmath';
export { didYouMean, suggest } from './suggest';
