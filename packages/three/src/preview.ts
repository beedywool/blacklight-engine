import { Container as PixiContainer, RenderContainer, RenderTexture } from 'pixi.js';
import { Group, SkinnedMesh, type Object3D } from 'three';
import { clone as cloneSkinned } from 'three/examples/jsm/utils/SkeletonUtils.js';
import type { Game, Unsubscribe } from '@blacklight/core';
import { ModelAnimator, type ModelAnimationSettings, type ModelPlayOptions } from './animator';
import { drawModel } from './context';
import { MODEL_EXTENSIONS, registerModelLoader, type LoadedModel } from './loader';
import { hasSkin } from './model3d';
import { View3D, type View3DOptions } from './view';

/** Options of a {@link ModelPreview}. */
export interface ModelPreviewOptions {
  /** Model file: asset key (`hero`) or project path (`@models/hero.glb`). Loaded if needed. */
  model: string;
  /** Size of the preview in CSS (or UI virtual) pixels. */
  width: number;
  height: number;
  /** Animation to play. @defaultValue the model's first */
  animation?: string;
  /** Turns the model around its vertical axis, in degrees per second. @defaultValue `0` */
  spin?: number;
  /** Starting turn around the vertical axis, in degrees. @defaultValue `0` */
  yaw?: number;
  /** Camera and lights. @defaultValue perspective camera, fov 30, default lights */
  view?: View3DOptions;
  /** Pixels per model unit. @defaultValue the model fills 90 % of the height */
  pixelsPerUnit?: number;
  /** Device pixels per CSS pixel of the texture. @defaultValue `game.textResolution` */
  resolution?: number;
  /** Per-animation settings, as `Model3D.animations`. */
  animations?: Record<string, ModelAnimationSettings>;
  /** Canvas to draw into; one is created otherwise. */
  canvas?: HTMLCanvasElement;
}

/**
 * A model rendered to a texture through the game's shared WebGL context and copied into a 2D
 * canvas every frame, so DOM interfaces (Vue screens) can show it: the rotating character of a
 * menu (3D-04). It animates in real time, also while the game is paused. `ModelView` from
 * `@blacklight/three/ui` wraps it for Vue screens.
 *
 * @example
 * ```ts
 * const preview = new ModelPreview(game, { model: 'hero', width: 320, height: 420, spin: 30 });
 * menu.append(preview.canvas);
 * await preview.ready;
 * preview.play('wave');
 * // later
 * preview.destroy();
 * ```
 */
export class ModelPreview {
  readonly canvas: HTMLCanvasElement;
  /** The model's root in model units (rotate or scale it). */
  readonly object3d = new Group();
  readonly view: View3D;
  /** Resolves once the model is loaded and shown. */
  readonly ready: Promise<void>;
  animator: ModelAnimator | undefined;
  loaded: LoadedModel | undefined;
  /** Frames copied to the canvas so far. */
  frames = 0;

  private readonly holder = new Group();
  private readonly root = new PixiContainer();
  private readonly display: RenderContainer;
  private texture: RenderTexture | undefined;
  private pixels: Uint8Array<ArrayBuffer> | undefined;
  private image: ImageData | undefined;
  private pixelsPerUnit = 100;
  private spin: number;
  private readonly offFrame: Unsubscribe;
  private destroyed = false;

  constructor(
    readonly game: Game,
    private readonly options: ModelPreviewOptions,
  ) {
    registerModelLoader();
    this.canvas = options.canvas ?? document.createElement('canvas');
    this.canvas.style.width = `${options.width}px`;
    this.canvas.style.height = `${options.height}px`;
    this.spin = options.spin ?? 0;
    this.object3d.rotation.y = ((options.yaw ?? 0) * Math.PI) / 180;
    this.view = new View3D({ camera: 'perspective', fov: 30, ...options.view });
    this.holder.add(this.object3d);
    this.display = new RenderContainer({
      render: (renderer) =>
        drawModel(renderer, this.display, this.holder, this.view, this.pixelsPerUnit),
    });
    this.root.addChild(this.display);
    this.offFrame = game.events.on('frame', ({ deltaMS }) => this.frame(deltaMS));
    this.ready = this.load();
  }

  private async load(): Promise<void> {
    const path = this.game.assets.find(this.options.model, { extensions: MODEL_EXTENSIONS })[0]!;
    await this.game.assets.load([path]);
    if (this.destroyed) return;
    const loaded = this.game.assets.get<LoadedModel>(path);
    this.loaded = loaded;
    const instance: Object3D = hasSkin(loaded.scene)
      ? cloneSkinned(loaded.scene)
      : loaded.scene.clone();
    instance.traverse((node) => {
      if (node instanceof SkinnedMesh) node.frustumCulled = false;
    });
    this.object3d.add(instance);
    const { width, height } = this.options;
    const sphere = loaded.sphere;
    this.pixelsPerUnit = this.options.pixelsPerUnit ?? (height * 0.9) / (sphere.radius * 2);
    // The bounding sphere's center sits at the middle of the canvas.
    this.display.position.set(
      width / 2 - sphere.center.x * this.pixelsPerUnit,
      height / 2 + sphere.center.y * this.pixelsPerUnit,
    );
    this.animator = new ModelAnimator(instance, loaded.animations, this.options.animations);
    const first = this.options.animation ?? loaded.animations[0]?.name;
    if (first) this.animator.play(first, { fade: 0 });
  }

  /** Plays an animation, like `Model3D.play`. */
  play(name: string, options?: ModelPlayOptions): void {
    if (!this.animator) throw new Error('The preview is still loading its model: await `ready`.');
    this.animator.play(name, options);
  }

  /** Changes the turning speed, in degrees per second. */
  setSpin(degreesPerSecond: number): void {
    this.spin = degreesPerSecond;
  }

  private frame(deltaMS: number): void {
    if (!this.animator || this.destroyed) return;
    this.animator.step(deltaMS / 1000);
    this.object3d.rotation.y += (this.spin * Math.PI * deltaMS) / 180_000;
    this.render();
  }

  /** Draws the model into the texture and copies it to the canvas. */
  render(): void {
    const renderer = this.game.app.renderer;
    const { width, height } = this.options;
    const resolution = this.options.resolution ?? this.game.textResolution;
    if (!this.texture || this.texture.source.resolution !== resolution) {
      this.texture?.destroy(true);
      this.texture = RenderTexture.create({ width, height, resolution, antialias: true });
    }
    renderer.render({
      container: this.root,
      target: this.texture,
      clear: true,
      clearColor: [0, 0, 0, 0],
    });
    this.copyToCanvas();
    this.frames++;
  }

  private copyToCanvas(): void {
    const renderer = this.game.app.renderer as unknown as {
      gl: WebGL2RenderingContext;
      renderTarget: {
        getRenderTarget(surface: RenderTexture): unknown;
        getGpuRenderTarget(target: unknown): {
          framebuffer: WebGLFramebuffer | null;
          resolveTargetFramebuffer?: WebGLFramebuffer | null;
          msaa: boolean;
        };
      };
    };
    const texture = this.texture!;
    const w = texture.source.pixelWidth;
    const h = texture.source.pixelHeight;
    const gpu = renderer.renderTarget.getGpuRenderTarget(
      renderer.renderTarget.getRenderTarget(texture),
    );
    const gl = renderer.gl;
    // Multisampled framebuffers cannot be read; Pixi resolves them into a second one.
    const framebuffer = gpu.msaa ? (gpu.resolveTargetFramebuffer ?? null) : gpu.framebuffer;
    if (this.pixels?.length !== w * h * 4) {
      this.pixels = new Uint8Array(w * h * 4);
      this.image = new ImageData(w, h);
      this.canvas.width = w;
      this.canvas.height = h;
    }
    // Only the read binding changes, so Pixi's cached draw binding stays true.
    const previous = gl.getParameter(gl.READ_FRAMEBUFFER_BINDING) as WebGLFramebuffer | null;
    gl.bindFramebuffer(gl.READ_FRAMEBUFFER, framebuffer);
    gl.readPixels(0, 0, w, h, gl.RGBA, gl.UNSIGNED_BYTE, this.pixels);
    gl.bindFramebuffer(gl.READ_FRAMEBUFFER, previous);
    unpremultiply(this.pixels, this.image!.data);
    this.canvas.getContext('2d')!.putImageData(this.image!, 0, 0);
  }

  /** Stops drawing and frees the texture. */
  destroy(): void {
    if (this.destroyed) return;
    this.destroyed = true;
    this.offFrame();
    this.animator?.stop();
    this.texture?.destroy(true);
    this.root.destroy({ children: true });
  }
}

/** Pixi keeps premultiplied colors; canvas image data is straight alpha. */
export function unpremultiply(source: Uint8Array, target: Uint8ClampedArray): void {
  for (let i = 0; i < source.length; i += 4) {
    const a = source[i + 3]!;
    if (a === 255 || a === 0) {
      target[i] = source[i]!;
      target[i + 1] = source[i + 1]!;
      target[i + 2] = source[i + 2]!;
    } else {
      const f = 255 / a;
      target[i] = source[i]! * f;
      target[i + 1] = source[i + 1]! * f;
      target[i + 2] = source[i + 2]! * f;
    }
    target[i + 3] = a;
  }
}
