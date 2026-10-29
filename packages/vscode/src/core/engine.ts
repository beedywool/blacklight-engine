// Pure engine code the extension shares with the runtime, bundled from the core sources so the
// editors read animation files and bindings exactly as the game does. These modules import types
// only (no renderer).
export {
  resolveAnimations,
  type AnimationDef,
  type AnimationFile,
  type ResolvedAnimation,
} from '../../../core/src/anim/animator';
export {
  gridSheet,
  isAsepriteJson,
  parseAseprite,
  parseGridName,
  type AsepriteJson,
  type GridSpec,
  type Sheet,
} from '../../../core/src/anim/sheets';
export { DEFAULT_ACTIONS, parseBinding } from '../../../core/src/input/bindings';
