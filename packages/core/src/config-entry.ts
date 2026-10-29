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
export {
  DEFAULT_OBFUSCATION,
  contentSecurityPolicy,
  resolveSecurity,
  type CspSources,
  type ObfuscationLevel,
  type ResolvedSecurity,
  type SecurityConfig,
} from './security/config';
export { resolveSaveConfig, type SaveConfig, type SaveLocation } from './save/config';
export type { DiscordConfig, SteamConfig, WindowConfig } from './desktop-config';
