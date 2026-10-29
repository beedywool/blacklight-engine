// `@blacklight/core/config`: configuration types and validation without the renderer, for the CLI.
export {
  ConfigError,
  defineConfig,
  resolveConfig,
  type GameConfig,
  type ResolutionConfig,
  type ResolutionMode,
  type ResolvedGameConfig,
} from './config';
export type { MobileConfig } from './config-mobile';
export { DEFAULT_ACTIONS, parseBinding, type Binding } from './input/bindings';
