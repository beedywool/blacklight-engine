import {
  AmbientLight,
  DirectionalLight,
  OrthographicCamera,
  PerspectiveCamera,
  Scene as ThreeScene,
  type ColorRepresentation,
} from 'three';
import type { Scene } from '@blacklight/core';
import type { CameraSettings } from './projection';

/**
 * Camera and lights of a 3D layer (or of one model). Every field is optional.
 *
 * @example
 * ```ts
 * const view: View3DOptions = {
 *   camera: 'perspective',
 *   fov: 35,
 *   ambient: 0.6,
 *   sun: { from: [-1, 2, 1], intensity: 3 },
 * };
 * ```
 */
export interface View3DOptions {
  /** @defaultValue `'orthographic'` */
  camera?: 'orthographic' | 'perspective';
  /** Vertical field of view of the perspective camera, in degrees. @defaultValue `40` */
  fov?: number;
  /** Ambient light: intensity, or color and intensity. @defaultValue `{ color: 0xffffff, intensity: 0.9 }` */
  ambient?: number | { color?: ColorRepresentation; intensity?: number };
  /**
   * Directional light. `from` is the direction it comes from in screen space (x right, y up, z
   * towards the viewer); `false` turns it off.
   * @defaultValue `{ from: [-0.6, 1, 0.8], color: 0xffffff, intensity: 2.4 }`
   */
  sun?:
    false | { from?: [number, number, number]; color?: ColorRepresentation; intensity?: number };
}

/**
 * Settings of the 3D layers of a scene, by layer name (`static layers3d` of the scene). Layers
 * without an entry use the defaults of {@link View3DOptions}.
 *
 * @example
 * ```ts
 * export default class Arena extends Scene {
 *   static layers = ['back', 'actors', 'front'];
 *   static layers3d: Layers3D = { actors: { camera: 'perspective', fov: 30 } };
 * }
 * ```
 */
export type Layers3D = Record<string, View3DOptions>;

/**
 * Camera settings and lights shared by the models of one 3D layer. Add your own Three.js lights to
 * `scene`; they light every model of the layer.
 */
export class View3D {
  /** Holds the lights; models are added to it only while they draw. */
  readonly scene = new ThreeScene();
  readonly ambient = new AmbientLight(0xffffff, 0.9);
  readonly sun = new DirectionalLight(0xffffff, 2.4);
  readonly camera: CameraSettings = { type: 'orthographic', fov: 40 };
  /** @internal */
  readonly perspective = new PerspectiveCamera();
  /** @internal */
  readonly orthographic = new OrthographicCamera();

  constructor(options: View3DOptions = {}) {
    this.scene.add(this.ambient, this.sun, this.sun.target);
    this.sun.position.set(-0.6, 1, 0.8);
    this.configure(options);
  }

  /** Changes the camera or lights; omitted fields keep their value. */
  configure(options: View3DOptions): this {
    if (options.camera) this.camera.type = options.camera;
    if (options.fov !== undefined) this.camera.fov = options.fov;
    const ambient = options.ambient;
    if (typeof ambient === 'number') this.ambient.intensity = ambient;
    else if (ambient) {
      if (ambient.color !== undefined) this.ambient.color.set(ambient.color);
      if (ambient.intensity !== undefined) this.ambient.intensity = ambient.intensity;
    }
    const sun = options.sun;
    if (sun === false) this.sun.visible = false;
    else if (sun) {
      this.sun.visible = true;
      if (sun.from) this.sun.position.set(...sun.from);
      if (sun.color !== undefined) this.sun.color.set(sun.color);
      if (sun.intensity !== undefined) this.sun.intensity = sun.intensity;
    }
    return this;
  }

  /** @internal The Three camera matching `camera.type`. */
  get threeCamera(): PerspectiveCamera | OrthographicCamera {
    return this.camera.type === 'perspective' ? this.perspective : this.orthographic;
  }
}

const views = new WeakMap<Scene<never>, Map<string, View3D>>();

/**
 * The camera and lights of a 3D layer of a scene, created from the scene's `static layers3d` on
 * first use. Change it at any time (for example to add a light in `create()`).
 *
 * @example
 * ```ts
 * create() {
 *   view3d(this, 'actors').configure({ camera: 'perspective', fov: 50 });
 *   view3d(this, 'actors').scene.add(new PointLight(0xff8800, 40));
 * }
 * ```
 */
export function view3d(scene: Scene<never> | Scene<unknown>, layer = 'main'): View3D {
  const key = scene as Scene<never>;
  let map = views.get(key);
  if (!map) {
    map = new Map();
    views.set(key, map);
  }
  let view = map.get(layer);
  if (!view) {
    const settings = (scene.constructor as { layers3d?: Layers3D }).layers3d;
    view = new View3D(settings?.[layer]);
    map.set(layer, view);
  }
  return view;
}
