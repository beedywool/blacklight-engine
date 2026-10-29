import { describe, expect, it } from 'vitest';
// Core sources, like the scene helper (vitest aliases @blacklight/core to them too).
import { GameObject } from '../../core/src/index';
import { testScene } from '../../core/test/helpers';
import { physics, RigidBody } from '../src/index';

class Crate extends GameObject {
  static override hitbox = { type: 'box' as const, x: -16, y: -16, width: 32, height: 32 };
  static override behaviors = [physics.body({ restitution: 0 })];
}

class Floor extends GameObject {
  static override hitbox = { type: 'box' as const, x: -320, y: -16, width: 640, height: 32 };
  static override behaviors = [physics.body({ type: 'fixed' })];
}

describe('physics', () => {
  it('falls under gravity, lands and reports the contact', () => {
    const scene = testScene();
    const hits: string[] = [];
    class Probe extends Crate {
      override onCollide(other: GameObject) {
        hits.push(other.objectName);
      }
    }
    scene.spawn(Floor, { x: 320, y: 300 });
    const crate = scene.spawn(Probe, { x: 320, y: 100 });
    scene.tick(180);
    expect(crate.y).toBeGreaterThan(260);
    expect(crate.y).toBeLessThan(270);
    expect(hits).toContain('Floor');
    expect(Math.abs(crate.velocity.y)).toBeLessThan(5);
  });

  it('applies impulses and velocities in pixels', () => {
    const scene = testScene();
    const crate = scene.spawn(Crate, { x: 100, y: 100 });
    const body = crate.behavior(RigidBody)!;
    body.setVelocity(300, 0);
    scene.tick(60);
    expect(crate.x).toBeGreaterThan(350);
    crate.destroy();
    scene.tick();
  });
});
