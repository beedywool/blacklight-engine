import { registerModelLoader } from './loader';

// Importing the package is what lets scenes preload .glb / .gltf files (3D-01, 3D-06).
registerModelLoader();

export { Model3D, type RenderToTextureOptions } from './model3d';
export {
  ModelAnimator,
  type ModelAnimationSettings,
  type ModelAnimationState,
  type ModelPlayOptions,
} from './animator';
export { View3D, view3d, type Layers3D, type View3DOptions } from './view';
export {
  MODEL_EXTENSIONS,
  extensionsUsed,
  loadModel,
  parseModel,
  registerModelLoader,
  type LoadedModel,
} from './loader';
export { SharedContext, drawModel, sharedContext, type PixiTarget } from './context';
export { ModelPreview, unpremultiply, type ModelPreviewOptions } from './preview';
export {
  eyeDistance,
  placeCamera,
  placeModel,
  type Affine,
  type CameraSettings,
} from './projection';
