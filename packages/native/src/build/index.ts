// `@blacklight/native/build`: packaging helpers the CLI's desktop targets use (Node only).
export {
  appManifest,
  electronBinary,
  electronVersion,
  isStaged,
  packageDir,
  stageApp,
  type StageOptions,
} from './stage';
export {
  DESKTOP_TARGETS,
  RELEASE_FUSES,
  builderConfig,
  packageApp,
  readFuses,
  type PackageOptions,
} from './package';
export { compileMainToBytecode } from './bytecode';
export {
  UNIVERSAL_ARCHES,
  UNIVERSAL_X64_ARCH_FILES,
  machOKind,
  makeSdlUniversal,
  sdlPrebuildUrl,
  universalElectrons,
} from './universal';
export { MAC_ENTITLEMENTS, signingPlan, type DesktopOs, type SigningPlan } from './sign';
export { depotId, steamUploadCommand, writeSteamScripts, type SteamUploadOptions } from './steam';
export type { AppManifest } from '../main/manifest';
