import { describe, expect, it, vi } from 'vitest';
import {
  behaviors,
  Fade,
  FourDirections,
  PathFollow,
  VirtualJoystick,
  DragAndDrop,
} from '../src/behaviors/index';
import { GameObject } from '../src/objects/game-object';
import { testScene } from './helpers';

class Box extends GameObject {
  static override hitbox = { type: 'box' as const, x: -8, y: -8, width: 16, height: 16 };
}

describe('more behaviors', () => {
  it('fourDirections moves on one axis at a time', () => {
    const scene = testScene();
    const hero = scene.spawn(
      class extends Box {
        static override behaviors = [behaviors.fourDirections({ speed: 60 })];
      },
      { x: 100, y: 100 },
    );
    scene.input.keyDown('ArrowRight');
    scene.input.keyDown('ArrowDown');
    scene.tick(60);
    expect(hero.y === 100 || hero.x === 100).toBe(true);
    expect(hero.behavior(FourDirections)!.facing).toMatch(/right|down/);
  });

  it('pathFollow visits points and completes', () => {
    const scene = testScene();
    const done = vi.fn();
    const mover = scene.spawn(
      class extends Box {
        static override behaviors = [
          behaviors.pathFollow({
            points: [
              { x: 10, y: 0 },
              { x: 10, y: 10 },
            ],
            speed: 600,
            onComplete: done,
          }),
        ];
      },
      { x: 0, y: 0 },
    );
    scene.tick(10);
    expect([mover.x, mover.y]).toEqual([10, 10]);
    expect(mover.behavior(PathFollow)!.finished).toBe(true);
    expect(done).toHaveBeenCalledOnce();
  });

  it('followTarget stops at the given distance; tankRotation drives along its angle', () => {
    const scene = testScene();
    const target = scene.spawn(Box, { x: 300, y: 100 });
    const follower = scene.spawn(
      class extends Box {
        static override behaviors = [
          behaviors.followTarget({ target, speed: 600, stopDistance: 50 }),
        ];
      },
      { x: 100, y: 100 },
    );
    follower.collision.blockedBySolids = false;
    scene.tick(60);
    expect(follower.x).toBeCloseTo(250);

    const tank = scene.spawn(
      class extends Box {
        static override behaviors = [behaviors.tankRotation({ speed: 60, turnSpeed: 90 })];
      },
      { x: 100, y: 300 },
    );
    scene.input.keyDown('ArrowUp');
    scene.tick(60);
    expect(tank.x).toBeCloseTo(160);
  });

  it('sineWave oscillates around the start; anchorToScreen sticks to the camera', () => {
    const scene = testScene();
    const floater = scene.spawn(
      class extends Box {
        static override behaviors = [behaviors.sineWave({ amplitude: 10, period: 1 })];
      },
      { x: 0, y: 100 },
    );
    scene.tick(15);
    expect(floater.y).toBeCloseTo(110, 0);
    scene.tick(45);
    expect(floater.y).toBeCloseTo(100, 0);

    const badge = scene.spawn(
      class extends Box {
        static override behaviors = [
          behaviors.anchorToScreen({ x: 1, y: 0, offset: { x: -20, y: 20 } }),
        ];
      },
    );
    scene.camera.centerOn(1000, 500);
    scene.tick();
    expect([badge.x, badge.y]).toEqual([1000 + 320 - 20, 500 - 180 + 20]);
  });

  it('fade in, wait, fade out and destroy', () => {
    const scene = testScene();
    const toast = scene.spawn(
      class extends Box {
        static override behaviors = [behaviors.fade({ fadeIn: 100, wait: 100, fadeOut: 100 })];
      },
    );
    scene.tick(3);
    expect(toast.alpha).toBeGreaterThan(0);
    expect(toast.alpha).toBeLessThan(1);
    scene.tick(20);
    expect(toast.alive).toBe(false);
    expect(toast.behaviors).toHaveLength(1);
    expect(Fade).toBeDefined();
  });

  it('pointer clicks and drag and drop snaps to a grid', () => {
    const scene = testScene();
    const click = vi.fn();
    scene.spawn(
      class extends Box {
        static override behaviors = [behaviors.pointer({ onClick: click })];
      },
      { x: 50, y: 50 },
    );
    const card = scene.spawn(
      class extends Box {
        static override behaviors = [behaviors.dragAndDrop({ snap: 32 })];
      },
      { x: 200, y: 200 },
    );
    scene.input.pointerDown(1, 'mouse', 0, { x: 50, y: 50 });
    scene.tick();
    scene.input.pointerUp(1, 'mouse', 0, { x: 50, y: 50 });
    scene.tick();
    expect(click).toHaveBeenCalledOnce();

    scene.input.pointerDown(1, 'mouse', 0, { x: 200, y: 200 });
    scene.tick();
    scene.input.pointerMove(1, 'mouse', { x: 250, y: 205 });
    scene.tick();
    expect(card.behavior(DragAndDrop)!.dragging).toBe(true);
    scene.input.pointerUp(1, 'mouse', 0, { x: 250, y: 205 });
    scene.tick();
    expect([card.x, card.y]).toEqual([256, 192]);
  });

  it('virtual joystick drives actions from a touch', () => {
    const scene = testScene();
    const stick = scene.spawn(
      class extends GameObject {
        static override behaviors = [behaviors.virtualJoystick({ radius: 50 })];
      },
      { layer: 'hud' },
    );
    scene.input.pointerDown(7, 'touch', 0, { x: 100, y: 200 });
    scene.tick();
    scene.input.pointerMove(7, 'touch', { x: 150, y: 200 });
    scene.tick(2);
    expect(stick.behavior(VirtualJoystick)!.value.x).toBeCloseTo(1);
    expect(scene.input.held('right')).toBe(true);
    scene.input.pointerUp(7, 'touch', 0, { x: 150, y: 200 });
    scene.tick(2);
    expect(scene.input.held('right')).toBe(false);
  });
});
