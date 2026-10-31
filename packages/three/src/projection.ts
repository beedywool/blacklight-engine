import type { Matrix4, Object3D, OrthographicCamera, PerspectiveCamera } from 'three';

/** A 2D affine matrix as Pixi stores it: `x' = a·x + c·y + tx`, `y' = b·x + d·y + ty`. */
export interface Affine {
  /** x scale and rotation: how much x' grows with x. */
  a: number;
  /** y' per unit of x (rotation, skew). */
  b: number;
  /** x' per unit of y (rotation, skew). */
  c: number;
  /** y scale and rotation: how much y' grows with y. */
  d: number;
  /** x translation. */
  tx: number;
  /** y translation. */
  ty: number;
}

/** Camera of a 3D view. */
export interface CameraSettings {
  /** `'orthographic'` keeps sizes on screen; `'perspective'` makes near parts bigger. */
  type: 'orthographic' | 'perspective';
  /** Vertical field of view of the perspective camera, in degrees. */
  fov: number;
}

/**
 * The 3D space every model is placed in ("view space" here): the render target in Pixi units,
 * origin at its center, x right, y up, z towards the viewer. Lights live in this space, so a light
 * from the top-left lights every model from the top-left of the screen whatever the 2D camera does.
 */
interface TargetFrame {
  /** Center of the render target, in Pixi target units. */
  cx: number;
  cy: number;
  /** Height of the render target, in Pixi target units. */
  height: number;
}

function frameOf(p: Affine): TargetFrame {
  // The center is the point Pixi's projection sends to clip (0, 0).
  const det = p.a * p.d - p.b * p.c;
  const cx = (p.c * p.ty - p.d * p.tx) / det;
  const cy = (p.b * p.tx - p.a * p.ty) / det;
  return { cx, cy, height: 2 / Math.hypot(p.b, p.d) };
}

/**
 * Distance of the perspective eye from the z = 0 plane, in target units: the distance at which a
 * camera with a vertical field of view of `fov` degrees sees exactly `height` units. `fov` is
 * clamped to 1–170.
 *
 * @example
 * ```ts
 * import { eyeDistance } from '@blacklight/three';
 *
 * eyeDistance(720, 60); // ≈ 623.5: a 60° camera sees 720 units at that distance
 * ```
 */
export function eyeDistance(height: number, fov: number): number {
  return height / 2 / Math.tan((Math.max(1, Math.min(170, fov)) * Math.PI) / 360);
}

/**
 * Sets a Three camera so that the z = 0 plane of view space lands exactly where Pixi draws: what
 * a model shows at depth 0 lines up with the sprites around it. The perspective eye looks at the
 * center of the render target (the screen, a split-screen view, or the texture of a
 * render-to-texture model).
 *
 * Use it with {@link SharedContext.draw} to draw your own Three.js objects among Pixi's;
 * `Model3D` does this for you.
 *
 * @param camera - The Three camera to set (its projection matrix, position and orientation).
 * @param projection - Pixi's projection of the bound render target (target units → clip space).
 * @param settings - Perspective or orthographic, and the field of view.
 *
 * @example
 * ```ts
 * import { placeCamera, sharedContext } from '@blacklight/three';
 *
 * sharedContext(renderer).draw((three, target) => {
 *   placeCamera(camera, target.projection, { type: 'perspective', fov: 40 });
 *   three.render(scene3d, camera);
 * });
 * ```
 */
export function placeCamera(
  camera: PerspectiveCamera | OrthographicCamera,
  projection: Affine,
  settings: CameraSettings,
): void {
  const { height } = frameOf(projection);
  const { a, b, c, d } = projection;
  // View space y points up, Pixi's target space down: the y column changes sign.
  const m = camera.projectionMatrix;
  if (settings.type === 'perspective') {
    const dist = eyeDistance(height, settings.fov);
    const near = dist * 0.1;
    const far = dist * 10;
    // Eye coordinates (z_e = z - dist): w = -z_e / dist is 1 on the z = 0 plane.
    // prettier-ignore
    m.set(
      a, -c, 0, 0,
      b, -d, 0, 0,
      0, 0, -(far + near) / (far - near) / dist, (-2 * far * near) / (far - near) / dist,
      0, 0, -1 / dist, 0,
    );
    camera.position.set(0, 0, dist);
  } else {
    const range = height * 10;
    // prettier-ignore
    m.set(
      a, -c, 0, 0,
      b, -d, 0, 0,
      0, 0, -1 / range, 0,
      0, 0, 0, 1,
    );
    camera.position.set(0, 0, 0);
  }
  camera.quaternion.identity();
  camera.updateMatrixWorld(true);
  camera.projectionMatrixInverse.copy(m).invert();
}

/**
 * Places a model like a sprite: its origin at the object's position, model units scaled to
 * `pixelsPerUnit`, y up in the model is up on screen, and the 2D rotation, scale and camera of the
 * object apply. Depth scales with the 2D scale so a zoomed model keeps its proportions.
 *
 * @param holder - The Three object to place; its matrix is set and no longer updated automatically.
 * @param projection - Pixi's projection of the bound render target.
 * @param transform - The object's transform from its local pixels to target units.
 * @param pixelsPerUnit - Size of one model unit in the object's local pixels.
 * @param z - Depth offset in local pixels, towards the viewer.
 *
 * @example
 * ```ts
 * import { placeCamera, placeModel, sharedContext } from '@blacklight/three';
 *
 * sharedContext(renderer).draw((three, target) => {
 *   placeCamera(camera, target.projection, { type: 'orthographic', fov: 40 });
 *   placeModel(holder, target.projection, target.group, 64);
 *   three.render(scene3d, camera);
 * });
 * ```
 */
export function placeModel(
  holder: Object3D,
  projection: Affine,
  transform: Affine,
  pixelsPerUnit: number,
  z = 0,
): void {
  const { cx, cy } = frameOf(projection);
  const k = pixelsPerUnit;
  const t = transform;
  const s = Math.sqrt(Math.abs(t.a * t.d - t.b * t.c));
  const m: Matrix4 = holder.matrix;
  // prettier-ignore
  m.set(
    t.a * k, -t.c * k, 0, t.tx - cx,
    -t.b * k, t.d * k, 0, cy - t.ty,
    0, 0, s * k, s * z,
    0, 0, 0, 1,
  );
  holder.matrixAutoUpdate = false;
  holder.matrixWorldNeedsUpdate = true;
}

/** Multiplies two Pixi affine matrices: `left · right` (right applies first). */
export function multiply(left: Affine, right: Affine, out: Affine): Affine {
  const a = left.a * right.a + left.c * right.b;
  const b = left.b * right.a + left.d * right.b;
  const c = left.a * right.c + left.c * right.d;
  const d = left.b * right.c + left.d * right.d;
  const tx = left.a * right.tx + left.c * right.ty + left.tx;
  const ty = left.b * right.tx + left.d * right.ty + left.ty;
  out.a = a;
  out.b = b;
  out.c = c;
  out.d = d;
  out.tx = tx;
  out.ty = ty;
  return out;
}
