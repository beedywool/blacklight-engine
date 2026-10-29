import {
  NoToneMapping,
  SRGBColorSpace,
  WebGLRenderTarget,
  WebGLRenderer as ThreeRenderer,
  type Camera,
  type Scene as ThreeScene,
} from 'three';
import type {
  BindOptions,
  RenderContainer,
  Renderer,
  WebGLRenderer as PixiWebGLRenderer,
} from 'pixi.js';
import type { Object3D } from 'three';
import { multiply, placeCamera, placeModel, type Affine } from './projection';
import type { View3D } from './view';

interface ExternalFramebuffers {
  setRenderTargetFramebuffer(target: WebGLRenderTarget, framebuffer: WebGLFramebuffer | null): void;
}

/** What a draw call needs to know about the target Pixi has bound. */
export interface PixiTarget {
  /** Pixi's projection of the bound target (target units → clip space). */
  projection: Affine;
  /** Transform of the render group being drawn, in target units. */
  group: Affine;
}

/**
 * One Three.js renderer per Pixi renderer, drawing into Pixi's own WebGL context (3D-02): models
 * are drawn in the middle of Pixi's frame, into whatever Pixi has bound (the screen, a split-screen
 * view, a filter's texture or a render-to-texture model), and both libraries reset their cached
 * GL state around each draw.
 */
export class SharedContext {
  /** The Three.js renderer, sharing Pixi's canvas and WebGL context. */
  readonly renderer: ThreeRenderer;
  /** Draws went through `draw()` since the context was created (for tests and the debug overlay). */
  draws = 0;
  // Holds Pixi's bound framebuffer so Three draws into it instead of creating its own.
  private readonly external = new WebGLRenderTarget(1, 1, { depthBuffer: false });
  private readonly bindState: BindOptions = { target: null as never };
  private invertFrontFace = false;

  /**
   * @param renderer - Only for tests: a renderer to use instead of creating one on Pixi's context.
   */
  constructor(
    readonly pixi: PixiWebGLRenderer,
    renderer?: ThreeRenderer,
  ) {
    // Three creates empty 3D textures while it starts, which WebGL refuses under Pixi's unpack
    // settings; both libraries set them again before their own uploads.
    const gl = pixi.gl;
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false);
    gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, false);
    this.renderer =
      renderer ??
      new ThreeRenderer({
        canvas: pixi.canvas as HTMLCanvasElement,
        context: pixi.gl,
        // Pixi composites premultiplied colors; Three must not clear what Pixi drew.
        premultipliedAlpha: true,
      });
    this.renderer.autoClear = false;
    this.renderer.outputColorSpace = SRGBColorSpace;
    this.renderer.toneMapping = NoToneMapping;
    // Three writes sRGB and tone maps only for the canvas or XR targets; Pixi's textures hold
    // sRGB colors too, so the external target is flagged like an XR one.
    (this.external as { isXRRenderTarget?: boolean }).isXRRenderTarget = true;
    this.external.texture.colorSpace = SRGBColorSpace;
    // Pixi flips render textures vertically, which turns triangle winding around. Three decides
    // the front face per object, so the flip is applied where it sets it.
    const state = this.renderer.state;
    const setFlipSided = state.setFlipSided.bind(state);
    state.setFlipSided = (flipSided: boolean) => setFlipSided(flipSided !== this.invertFrontFace);
  }

  /**
   * Draws with Three into the target Pixi has bound, then hands the context back to Pixi.
   * Called from a Pixi render pipe, between Pixi's own draw calls.
   */
  draw(paint: (renderer: ThreeRenderer, target: PixiTarget) => void): void {
    const pixi = this.pixi;
    const targets = pixi.renderTarget;
    // Models need depth testing; Pixi adds a depth-stencil buffer to texture targets on demand.
    targets.ensureDepthStencil();
    targets.getBindState(this.bindState);
    const gpuTarget = targets.getGpuRenderTarget(targets.renderTarget) as {
      framebuffer: WebGLFramebuffer | null;
    };
    // Pixi's viewport, as it set it on the GL context: reading it back from GL would wait for the
    // GPU process. The canvas is bottom-up in GL; Pixi's textures are not.
    const view = targets.viewport;
    const bound = targets.renderTarget;
    const y = bound.isRoot ? bound.pixelHeight - view.height - view.y : view.y;
    const viewport = [view.x, y, view.width, view.height];
    const uniforms = pixi.globalUniforms.uniformGroup.uniforms as {
      uProjectionMatrix: Affine;
      uWorldTransformMatrix: Affine;
    };
    this.invertFrontFace = targets.isFrontFaceInverted();

    const three = this.renderer;
    three.resetState();
    const external = this.external;
    external.width = viewport[2]!;
    external.height = viewport[3]!;
    external.viewport.set(viewport[0]!, viewport[1]!, viewport[2]!, viewport[3]!);
    external.scissor.copy(external.viewport);
    external.scissorTest = false;
    // Three's hook for externally managed framebuffers (WebXR uses it); missing from its types.
    (three as unknown as ExternalFramebuffers).setRenderTargetFramebuffer(
      external,
      gpuTarget.framebuffer,
    );
    three.setRenderTarget(external);
    try {
      paint(three, {
        projection: uniforms.uProjectionMatrix,
        group: uniforms.uWorldTransformMatrix,
      });
    } finally {
      this.draws++;
      three.resetState();
      pixi.resetState();
      // Pixi forgot its binding in resetState: bind the same target again, without clearing.
      targets.bind(this.bindState);
    }
  }

  /** Clears depth, then renders `scene` through `camera` into the current target. */
  static render(renderer: ThreeRenderer, scene: ThreeScene, camera: Camera): void {
    renderer.clearDepth();
    renderer.render(scene, camera);
  }
}

const contexts = new WeakMap<object, SharedContext>();

/**
 * The shared Three.js context of a Pixi renderer, created on first use.
 *
 * @example
 * ```ts
 * const three = sharedContext(this.game.app.renderer).renderer;
 * three.info.render.triangles; // triangles drawn by the last model
 * ```
 * @throws Error when Pixi runs on WebGPU, which Three.js cannot share.
 */
export function sharedContext(renderer: Renderer): SharedContext {
  let context = contexts.get(renderer);
  if (!context) {
    if (!('gl' in renderer)) {
      throw new Error(
        'Model3D needs Pixi on WebGL to share its context with Three.js, but the game runs on WebGPU. Remove `preference: "webgpu"` from the renderer options.',
      );
    }
    context = new SharedContext(renderer as PixiWebGLRenderer);
    contexts.set(renderer, context);
  }
  return context;
}

const scratch: Affine = { a: 1, b: 0, c: 0, d: 1, tx: 0, ty: 0 };

/**
 * Draws `holder` (a model in model units) where Pixi is drawing `display`, with the camera and
 * lights of `view`. Called from the `render` function of a Pixi `RenderContainer`.
 */
export function drawModel(
  renderer: Renderer,
  display: RenderContainer,
  holder: Object3D,
  view: View3D,
  pixelsPerUnit: number,
  z = 0,
): void {
  sharedContext(renderer).draw((three, target) => {
    multiply(target.group, display.groupTransform, scratch);
    placeCamera(view.threeCamera, target.projection, view.camera);
    placeModel(holder, target.projection, scratch, pixelsPerUnit, z);
    view.scene.add(holder);
    try {
      SharedContext.render(three, view.scene, view.threeCamera);
    } finally {
      view.scene.remove(holder);
    }
  });
}
