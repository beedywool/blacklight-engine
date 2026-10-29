import {
  Container as PixiContainer,
  RenderContainer,
  RenderTexture,
  Sprite as PixiSprite,
  type Bounds,
  type BoundsData,
  type DestroyOptions,
  type Renderer,
} from 'pixi.js';
import { Group, SkinnedMesh, type Euler, type Object3D } from 'three';
import { clone as cloneSkinned } from 'three/examples/jsm/utils/SkeletonUtils.js';
import {
  GameObject,
  type AnimationName,
  type AssetKey,
  type HitboxSpec,
  type Unsubscribe,
} from '@blacklight/core';
import {
  ModelAnimator,
  type ModelAnimationSettings,
  type ModelAnimationState,
  type ModelPlayOptions,
} from './animator';
import { drawModel } from './context';
import { MODEL_EXTENSIONS, registerModelLoader, type LoadedModel } from './loader';
import { View3D, view3d, type View3DOptions } from './view';

/** Size of the texture of a render-to-texture model, in virtual pixels. */
export interface RenderToTextureOptions {
  /** @defaultValue the model's bounding sphere, with a margin */
  width?: number;
  height?: number;
  /** Texture pixels per virtual pixel. @defaultValue the screen's (`game.textResolution`) */
  resolution?: number;
  /** Point of the model shown at the texture's center, in model units. @defaultValue the bounding sphere's center */
  center?: { x: number; y: number };
}

/** Engine state of a model kept in snapshots. */
type ModelState = { rx: number; ry: number; rz: number; z: number } & Partial<ModelAnimationState>;

/**
 * A glTF / GLB model placed like a sprite (3D-03): 2D position, rotation, scale, layer and z-order
 * between 2D objects, collisions with its auto hitbox. It draws with Three.js inside Pixi's frame,
 * through Pixi's WebGL context; `play('walk')` runs its skeletal animations on the game clock.
 *
 * The model's origin sits at the object's position; one model unit is `pixelsPerUnit` virtual
 * pixels; y up in the model is up on screen and z points at the viewer. Camera and lights come from
 * the scene's `static layers3d` entry for the object's layer (`view3d()`), or from `static view`.
 *
 * With `static renderToTexture`, the model draws into a texture shown by a sprite (3D-04): Pixi
 * filters, masks, alpha and tint then apply, like on any sprite.
 *
 * @example
 * ```ts
 * // scenes/arena/objects/robot/robot.object.ts (+ robot.glb in the same folder)
 * export default class Robot extends Model3D {
 *   static pixelsPerUnit = 120;
 *   static animations = { wave: { loop: false, next: 'idle' } };
 *   static behaviors = [behaviors.eightDirections({ speed: 200 })];
 *   update() {
 *     this.play(this.velocity.length > 0 ? 'walk' : 'idle');
 *     if (this.velocity.x !== 0) this.rotation3d.y = this.velocity.x > 0 ? 0.6 : -0.6;
 *   }
 * }
 * ```
 */
export class Model3D extends GameObject {
  /** Model file: a path relative to the object's folder, an `@models/…` path or an asset key. Defaults to `<folder>/<name>.glb` (or `.gltf`). */
  static model: AssetKey | undefined;
  /** Virtual pixels per model unit (glTF units are meters). @defaultValue `100` */
  static pixelsPerUnit = 100;
  /** Draws into a texture shown as a sprite (filters, masks, alpha, tint). @defaultValue `false` */
  static renderToTexture: boolean | RenderToTextureOptions = false;
  /** Own camera and lights instead of the layer's (`static layers3d` of the scene). */
  static view: View3DOptions | undefined;
  /** Loop, chaining, speed, cross-fade and events of each animation. */
  static animations: Record<string, ModelAnimationSettings> | undefined;
  /** Animation played on spawn. @defaultValue the first one, if the model has any */
  static defaultAnimation: string | undefined;
  static override hitbox: HitboxSpec = 'auto';

  /** Model of this instance; overrides `static model` (set it in `spawn` props). */
  model: AssetKey | undefined;
  /** Depth offset towards the viewer, in virtual pixels (moves the model in a perspective view). */
  z = 0;
  /** Plays the skeletal animations; `undefined` until the model is shown. */
  animator: ModelAnimator | undefined;

  private readonly holder = new Group();
  private readonly root3d = new Group();
  private file: LoadedModel | undefined;
  private readonly display: RenderContainer;
  private instance: Object3D | undefined;
  private ownView: View3D | undefined;
  private rtt:
    { root: PixiContainer; sprite: PixiSprite; texture: RenderTexture | undefined } | undefined;

  constructor() {
    super();
    const type = this.constructor as typeof Model3D;
    this.holder.add(this.root3d);
    this.display = new RenderContainer({
      render: (renderer) => this.draw3d(renderer),
      addBounds: (bounds) => this.addModelBounds(bounds),
    });
    if (type.renderToTexture) {
      const root = new PixiContainer();
      root.addChild(this.display);
      const sprite = new PixiSprite();
      this.addChild(sprite);
      this.rtt = { root, sprite, texture: undefined };
    } else {
      this.addChild(this.display);
    }
    this.markEngineKeys();
  }

  /** @internal Preloads the model with the scene (core calls it for every object class). */
  static override requiredAssets(): string[] {
    registerModelLoader();
    if (this.model) return [this.model];
    if (!this.objectPath) return [];
    return [`./${this.objectPath.slice(this.objectPath.lastIndexOf('/') + 1)}`];
  }

  /**
   * The model's root in model units: rotate or scale it, add Three.js objects, change materials.
   * Reading it in `create()` already gives the loaded model.
   */
  get object3d(): Group {
    this.ensureModel();
    return this.root3d;
  }

  /** The loaded file this object shows (`undefined` before the object joins a scene). */
  get loaded(): LoadedModel | undefined {
    this.ensureModel();
    return this.file;
  }

  /** Euler rotation of the model in 3D (radians); `rotation` stays the 2D rotation. */
  get rotation3d(): Euler {
    return this.root3d.rotation;
  }

  /** Name of the playing animation. */
  get animation(): string | undefined {
    return this.ensureModel()?.name;
  }

  /** Animation names of the model. */
  get animationNames(): string[] {
    return this.ensureModel()?.names ?? [];
  }

  /**
   * Plays a skeletal animation. Calling it every step with the same name keeps it running;
   * `restart` starts it over; a missing name falls back to a close one with a warning.
   */
  play(name: AnimationName, options?: ModelPlayOptions): this {
    const animator = this.ensureModel();
    if (!animator) throw this.noModelError();
    animator.play(name, options);
    this.applyFlip();
    return this;
  }

  /** Plays `name` after the current (non-looping) animation ends. */
  queue(name: AnimationName): this {
    this.ensureModel()?.queue(name);
    return this;
  }

  /** Stops the animations; the model keeps its pose. */
  stopAnimation(): this {
    this.ensureModel()?.stop();
    return this;
  }

  /** Called when a non-looping animation ends. */
  onEnd(listener: (animation: string) => void): Unsubscribe {
    const animator = this.ensureModel();
    if (!animator) throw this.noModelError();
    return animator.onEnd(listener);
  }

  /** Listens to an event of `static animations` (`events: { 0.4: 'step' }`). */
  onFrame(event: string, listener: (animation: string) => void): Unsubscribe {
    const animator = this.ensureModel();
    if (!animator) throw this.noModelError();
    return animator.onEvent((name, animation) => {
      if (name === event) listener(animation);
    });
  }

  /** Shows another model file (it must be preloaded). Animations restart. */
  setModel(keyOrPath: AssetKey): this {
    this.model = keyOrPath;
    this.clearModel();
    this.ensureModel();
    return this;
  }

  /** Camera and lights this model draws with. */
  get view(): View3D {
    const type = this.constructor as typeof Model3D;
    if (type.view) return (this.ownView ??= new View3D(type.view));
    if (!this.scene) return (this.ownView ??= new View3D());
    return view3d(this.scene, this.layerName());
  }

  private layerName(): string {
    let node: PixiContainer | null = this as PixiContainer;
    for (; node?.parent; node = node.parent) {
      if (node.parent === this.scene.world) return node.label;
      if (node.parent === this.scene.hud) return 'hud';
    }
    return this.scene.defaultLayer;
  }

  private noModelError(): Error {
    return new Error(
      `${this.objectName} has no model to animate yet. Spawn it in a scene first, and give its class \`static model = './${this.objectName.toLowerCase()}.glb'\`.`,
    );
  }

  /** Builds the instance from the preloaded file on first use. */
  private ensureModel(): ModelAnimator | undefined {
    if (this.file) return this.animator;
    if (!this.game) return undefined;
    const type = this.constructor as typeof Model3D;
    const wanted = this.model ?? type.model;
    let path: string;
    try {
      path = this.game.assets.find(
        wanted ??
          `./${(type.objectPath ?? '').slice((type.objectPath ?? '').lastIndexOf('/') + 1)}`,
        { baseDir: type.objectPath, extensions: MODEL_EXTENSIONS },
      )[0]!;
    } catch (error) {
      throw new Error(
        `${this.objectName} has no model file. ${wanted ? '' : 'Put a .glb named after its folder next to it, or set `static model`. '}${(error as Error).message}`,
        { cause: error },
      );
    }
    const loaded = this.game.assets.get<LoadedModel>(path);
    this.file = loaded;
    this.instance = hasSkin(loaded.scene) ? cloneSkinned(loaded.scene) : loaded.scene.clone();
    this.instance.traverse((node) => {
      // Skinned parts move away from their rest bounds; culling them would make limbs vanish.
      if (node instanceof SkinnedMesh) node.frustumCulled = false;
    });
    this.root3d.add(this.instance);
    this.animator = new ModelAnimator(
      this.instance,
      loaded.animations,
      type.animations,
      this.objectName,
    );
    const first = type.defaultAnimation ?? loaded.animations[0]?.name;
    if (first) this.animator.play(first, { fade: 0 });
    // Bounds and culling follow the model's size.
    (this.display as unknown as { onViewUpdate(): void }).onViewUpdate();
    return this.animator;
  }

  private clearModel(): void {
    this.animator?.stop();
    if (this.instance) this.root3d.remove(this.instance);
    this.instance = undefined;
    this.file = undefined;
    this.animator = undefined;
    this.rtt?.texture?.destroy(true);
    if (this.rtt) this.rtt.texture = undefined;
  }

  private applyFlip(): void {
    const flip = this.animator?.flipX ? -1 : 1;
    if (this.instance) this.instance.scale.x = Math.abs(this.instance.scale.x) * flip;
  }

  /** Rest bounds of the model in local pixels (x right, y down). */
  private localBox(): { x0: number; y0: number; x1: number; y1: number } | undefined {
    const box = this.file?.box;
    if (!box || box.isEmpty()) return undefined;
    const k = (this.constructor as typeof Model3D).pixelsPerUnit;
    return { x0: box.min.x * k, x1: box.max.x * k, y0: -box.max.y * k, y1: -box.min.y * k };
  }

  private addModelBounds(bounds: BoundsData): void {
    this.ensureModel();
    const box = this.localBox();
    if (box) (bounds as Bounds).addFrame(box.x0, box.y0, box.x1, box.y1);
  }

  /** The model's rest box, ignoring `rotation3d`. */
  protected override autoHitbox(): Exclude<HitboxSpec, 'auto' | 'none' | 'pixel'> | undefined {
    this.ensureModel();
    const box = this.localBox();
    if (!box) return undefined;
    return { type: 'box', x: box.x0, y: box.y0, width: box.x1 - box.x0, height: box.y1 - box.y0 };
  }

  protected override stepInternal(dt: number): void {
    this.ensureModel()?.step(dt);
  }

  /** Draws the model with Three.js where Pixi is drawing (the screen or the model's texture). */
  private draw3d(renderer: Renderer): void {
    if (!this.ensureModel() || !this.instance) return;
    const k = (this.constructor as typeof Model3D).pixelsPerUnit;
    drawModel(renderer, this.display, this.holder, this.view, k, this.z);
  }

  /** @internal Also redraws the texture of a render-to-texture model, once per frame. */
  override interpolate(alpha: number, round: boolean): void {
    super.interpolate(alpha, round);
    if (this.rtt && this.visible && this.game?.app?.renderer) this.renderTexture();
  }

  private renderTexture(): void {
    const rtt = this.rtt!;
    if (!this.ensureModel()) return;
    if (!rtt.texture) {
      const sphere = this.file!.sphere;
      const options = (this.constructor as typeof Model3D).renderToTexture;
      const k = (this.constructor as typeof Model3D).pixelsPerUnit;
      const side = Math.ceil(sphere.radius * 2.2 * k);
      const width = (typeof options === 'object' && options.width) || side;
      const height = (typeof options === 'object' && options.height) || side;
      const resolution =
        (typeof options === 'object' && options.resolution) || this.game.textResolution;
      rtt.texture = RenderTexture.create({ width, height, resolution, antialias: true });
      rtt.sprite.texture = rtt.texture;
      // The bounding sphere's center (or `center`) sits at the middle of the texture.
      const center = (typeof options === 'object' && options.center) || sphere.center;
      const cx = center.x * k;
      const cy = -center.y * k;
      this.display.position.set(width / 2 - cx, height / 2 - cy);
      rtt.sprite.position.set(cx - width / 2, cy - height / 2);
    }
    this.game.app.renderer.render({
      container: rtt.root,
      target: rtt.texture,
      clear: true,
      clearColor: [0, 0, 0, 0],
    });
  }

  override snapshotState(): ModelState {
    const r = this.root3d.rotation;
    return { rx: r.x, ry: r.y, rz: r.z, z: this.z, ...this.animator?.capture() };
  }

  override restoreState(state: Record<string, unknown>): void {
    const s = state as ModelState;
    this.root3d.rotation.set(s.rx ?? 0, s.ry ?? 0, s.rz ?? 0);
    this.z = s.z ?? 0;
    const animator = this.ensureModel();
    if (animator && s.time !== undefined) {
      animator.restore({ name: s.name, time: s.time, speed: s.speed ?? 1, flipX: !!s.flipX });
      this.applyFlip();
    }
  }

  override destroy(options?: DestroyOptions): void {
    if (!this.alive) return;
    this.animator?.stop();
    this.rtt?.texture?.destroy(true);
    this.rtt?.root.destroy({ children: true });
    super.destroy(options);
  }
}

/** `true` when the model has skinned meshes, which need their skeleton cloned too. */
export function hasSkin(root: Object3D): boolean {
  let skinned = false;
  root.traverse((node) => {
    if (node instanceof SkinnedMesh) skinned = true;
  });
  return skinned;
}
