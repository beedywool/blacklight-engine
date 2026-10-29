export { CapacitorFiles, FILES_ROOT, fromBase64, isNotFound, toBase64 } from './files';
export {
  RESERVED_PREFIX,
  appModule,
  gamesModule,
  hapticsModule,
  secureStorageModule,
  sqliteModule,
  type NativeModule,
  type SqliteChanges,
} from './modules';
export { BUILT_IN, MobilePlatform, SAVE_KEY_ENTRY, type MobileEvents } from './platform';
export {
  mobile,
  resolveMobileConfig,
  tapAction,
  type MobileOptions,
  type ResolvedMobileConfig,
} from './plugin';
export {
  capacitorPlugins,
  isNativeApp,
  type GamesPlugin,
  type ListenerHandle,
  type MobilePlugins,
} from './plugins';
