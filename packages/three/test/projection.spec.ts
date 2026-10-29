import { describe, expect, it } from 'vitest';
import { Group, OrthographicCamera, PerspectiveCamera, Vector4 } from 'three';
import { eyeDistance, multiply, placeCamera, placeModel, type Affine } from '../src/projection';

const W = 1280;
const H = 720;
/** Pixi's projection of the canvas (y down) and of a render texture (stored flipped). */
const screen: Affine = { a: 2 / W, b: 0, c: 0, d: -2 / H, tx: -1, ty: 1 };
const texture: Affine = { a: 2 / W, b: 0, c: 0, d: 2 / H, tx: -1, ty: -1 };

/** Where Pixi draws a local point of an object: projection · transform · point. */
function pixi(projection: Affine, transform: Affine, x: number, y: number): [number, number] {
  const tx = transform.a * x + transform.c * y + transform.tx;
  const ty = transform.b * x + transform.d * y + transform.ty;
  return [
    projection.a * tx + projection.c * ty + projection.tx,
    projection.b * tx + projection.d * ty + projection.ty,
  ];
}

/** Where the Three setup draws a model point, in clip space after the perspective divide. */
function three(
  camera: PerspectiveCamera | OrthographicCamera,
  holder: Group,
  x: number,
  y: number,
  z: number,
): [number, number, number] {
  holder.updateMatrixWorld(true);
  const p = new Vector4(x, y, z, 1)
    .applyMatrix4(holder.matrixWorld)
    .applyMatrix4(camera.matrixWorldInverse)
    .applyMatrix4(camera.projectionMatrix);
  return [p.x / p.w, p.y / p.w, p.z / p.w];
}

describe('placing models like sprites', () => {
  const at: Affine = { a: 1, b: 0, c: 0, d: 1, tx: 400, ty: 300 };

  for (const [name, projection] of [
    ['screen', screen],
    ['render texture', texture],
  ] as const) {
    for (const type of ['orthographic', 'perspective'] as const) {
      it(`puts the z = 0 plane where Pixi draws (${name}, ${type})`, () => {
        const camera = type === 'perspective' ? new PerspectiveCamera() : new OrthographicCamera();
        const holder = new Group();
        placeCamera(camera, projection, { type, fov: 40 });
        placeModel(holder, projection, at, 100);
        // The origin sits on the object's position; one unit right and up is 100 px right, 100 px up.
        const [x0, y0] = three(camera, holder, 0, 0, 0);
        expect(x0).toBeCloseTo(pixi(projection, at, 0, 0)[0]);
        expect(y0).toBeCloseTo(pixi(projection, at, 0, 0)[1]);
        const [x1, y1, depth] = three(camera, holder, 1, 1, 0);
        expect(x1).toBeCloseTo(pixi(projection, at, 100, -100)[0]);
        expect(y1).toBeCloseTo(pixi(projection, at, 100, -100)[1]);
        expect(Math.abs(depth)).toBeLessThan(1);
      });
    }
  }

  it('follows the 2D rotation, scale and camera of the object', () => {
    const rotation = Math.PI / 2;
    const object: Affine = {
      a: 2 * Math.cos(rotation),
      b: 2 * Math.sin(rotation),
      c: -2 * Math.sin(rotation),
      d: 2 * Math.cos(rotation),
      tx: 50,
      ty: 60,
    };
    const camera: Affine = { a: 1.5, b: 0, c: 0, d: 1.5, tx: 10, ty: -20 };
    const transform = multiply(camera, object, { a: 1, b: 0, c: 0, d: 1, tx: 0, ty: 0 });
    const ortho = new OrthographicCamera();
    const holder = new Group();
    placeCamera(ortho, screen, { type: 'orthographic', fov: 40 });
    placeModel(holder, screen, transform, 100);
    const [x, y] = three(ortho, holder, 0.5, 0.25, 0);
    const expected = pixi(screen, transform, 50, -25);
    expect(x).toBeCloseTo(expected[0]);
    expect(y).toBeCloseTo(expected[1]);
  });

  it('makes near parts bigger and far parts smaller in perspective, not in orthographic', () => {
    const perspective = new PerspectiveCamera();
    const ortho = new OrthographicCamera();
    const holder = new Group();
    const right: Affine = { ...at, tx: 1000 };
    placeModel(holder, screen, right, 100);
    placeCamera(perspective, screen, { type: 'perspective', fov: 40 });
    placeCamera(ortho, screen, { type: 'orthographic', fov: 40 });
    const flat = three(perspective, holder, 0, 0, 0)[0];
    expect(three(perspective, holder, 0, 0, 1)[0]).toBeGreaterThan(flat);
    expect(three(perspective, holder, 0, 0, -1)[0]).toBeLessThan(flat);
    expect(three(ortho, holder, 0, 0, 1)[0]).toBeCloseTo(three(ortho, holder, 0, 0, -1)[0]);
    // Nearer points have a smaller depth, so the depth test keeps them.
    expect(three(perspective, holder, 0, 0, 1)[2]).toBeLessThan(
      three(perspective, holder, 0, 0, -1)[2],
    );
    expect(three(ortho, holder, 0, 0, 1)[2]).toBeLessThan(three(ortho, holder, 0, 0, -1)[2]);
  });

  it('derives the eye distance from the field of view', () => {
    expect(eyeDistance(720, 90)).toBeCloseTo(360);
    expect(eyeDistance(720, 40)).toBeGreaterThan(eyeDistance(720, 60));
  });
});
