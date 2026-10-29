import { describe, expect, it } from 'vitest';
import { Camera } from '../src/camera';
import { Random } from '../src/random';

const camera = () =>
  new Camera(
    () => ({ width: 400, height: 200 }),
    () => new Random(1),
  );

describe('Camera', () => {
  it('starts centered on the design area and converts points', () => {
    const c = camera();
    expect([c.x, c.y]).toEqual([200, 100]);
    c.zoom = 2;
    c.centerOn(500, 300);
    expect(c.toWorld({ x: 200, y: 100 })).toEqual({ x: 500, y: 300 });
    expect(c.toWorld({ x: 0, y: 0 })).toEqual({ x: 400, y: 250 });
    expect(c.toScreen({ x: 400, y: 250 })).toEqual({ x: 0, y: 0 });
  });

  it('follows with lerp and dead zone, inside bounds', () => {
    const c = camera();
    const target = { x: 1000, y: 100 };
    c.follow(target, { lerp: 1 });
    c.bounds = { x: 0, y: 0, width: 800, height: 200 };
    c.step(16);
    expect(c.x).toBe(600); // clamped: half the view (200) from the right edge
    c.bounds = undefined;
    c.follow(target, { lerp: 1, deadzone: { width: 100, height: 100 } });
    target.x = 1020;
    c.step(16);
    c.step(16);
    expect(c.x).toBe(970);
  });

  it('shakes and settles', () => {
    const c = camera();
    c.shake(10, 100);
    c.step(16);
    expect(Math.abs(c.shakeOffset.x) + Math.abs(c.shakeOffset.y)).toBeGreaterThan(0);
    for (let i = 0; i < 10; i++) c.step(16);
    expect(c.shakeOffset).toEqual({ x: 0, y: 0 });
  });

  it('maps split-screen viewports', () => {
    const c = camera();
    c.viewport = { x: 0.5, y: 0, width: 0.5, height: 1 };
    expect(c.viewWidth).toBe(200);
    expect(c.toWorld({ x: 300, y: 100 })).toEqual({ x: 200, y: 100 });
  });
});
