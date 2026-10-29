// `@blacklight/native/main`: the Electron main process. Native modules (defineNative, engine
// modules) register their functions here; the page reaches nothing else.
export { startApp, type StartOptions } from './app';
export {
  callNative,
  emitToGame,
  method,
  registerNative,
  registeredNatives,
  type NativeMethod,
} from './registry';
export {
  ValidationError,
  v,
  type Infer,
  type InferArgs,
  type JsonValue,
  type Validator,
} from './validate';
export { APP_ORIGIN, type AppManifest } from './manifest';
export {
  DiscordClient,
  discordSocketPaths,
  type DiscordActivity,
  type DiscordHandlers,
  type DiscordUser,
} from './discord';
export {
  checkRelativePath,
  dataFolder,
  defaultDataDir,
  expandPath,
  type DataFolder,
} from './files';
