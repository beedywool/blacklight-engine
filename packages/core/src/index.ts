export {
  ConfigError,
  defineConfig,
  resolveConfig,
  type GameConfig,
  type ResolutionConfig,
  type ResolutionMode,
  type ResolvedGameConfig,
} from './config';
export { Game, createGame, type CreateGameOptions } from './game';
export { FixedStep } from './loop';
export { Scene } from './scene';
export { scenesFromGlob, type SceneClass, type SceneLoader } from './scenes';
export { didYouMean, suggest } from './suggest';
export { computeViewport, type Viewport } from './viewport';

// Display objects come straight from PixiJS until the engine's own objects land (RT-05).
export { Container, Graphics, Sprite, Text } from 'pixi.js';
