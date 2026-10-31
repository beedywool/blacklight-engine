import { describe, expect, it, vi } from 'vitest';
import {
  behaviors,
  Bounce,
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

class Wall extends GameObject {
  static override hitbox = { type: 'box' as const, width: 32, height: 32 };
  static override collision = { solid: true };
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

  it('fade out without destroy, then fade back in', () => {
    const scene = testScene();
    const ghost = scene.spawn(
      class extends Box {
        static override behaviors = [behaviors.fade({ destroy: false })];
      },
    );
    const fade = ghost.behavior(Fade)!;
    fade.fadeOut(100);
    scene.tick(10);
    expect(ghost.alive).toBe(true);
    expect(ghost.alpha).toBe(0);
    fade.fadeIn(100);
    scene.tick(3);
    expect(ghost.alpha).toBeGreaterThan(0);
    expect(ghost.alpha).toBeLessThan(1);
    scene.tick(10);
    expect(ghost.alpha).toBe(1);
    // A fade out can follow again.
    fade.fadeOut(100);
    scene.tick(10);
    expect(ghost.alpha).toBe(0);
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

describe('movement options', () => {
  it('eightDirections speeds up and slows down at the given rates', () => {
    const scene = testScene();
    const hero = scene.spawn(
      class extends Box {
        static override behaviors = [
          behaviors.eightDirections({ speed: 120, acceleration: 240, deceleration: 480 }),
        ];
      },
      { x: 100, y: 100 },
    );
    scene.input.keyDown('ArrowLeft');
    scene.tick(30);
    expect(hero.velocity.x).toBeCloseTo(-120); // full speed after 0.5 s
    scene.input.keyUp('ArrowLeft');
    scene.tick(6);
    expect(hero.velocity.x).toBeCloseTo(-72);
    scene.tick(30);
    expect(hero.velocity.x).toBe(0);
  });

  it('bullet flies along its rotation, accelerates, falls, turns with its path, and may survive walls', () => {
    const scene = testScene();
    class Shell extends Box {
      static override behaviors = [
        behaviors.bullet({
          speed: 60,
          acceleration: 60,
          gravity: 120,
          rotate: true,
          destroyOnSolid: false,
        }),
      ];
    }
    const shell = scene.add(new Shell());
    shell.teleport(100, 100);
    expect(shell.velocity.x).toBeCloseTo(60); // rotation 0: to the right
    scene.tick(60);
    // Gravity pulls it down at 120 px/s², acceleration adds 60 px/s² along its path.
    expect(shell.velocity.y).toBeGreaterThan(120);
    expect(shell.velocity.length).toBeGreaterThan(160);
    expect(shell.rotation).toBeCloseTo(Math.atan2(shell.velocity.y, shell.velocity.x));
    scene.spawn(Wall, { x: shell.x + 10, y: shell.y - 16 });
    scene.tick(10);
    expect(shell.alive).toBe(true);
  });

  it('bounce reflects off scene edges unless edges is false', () => {
    const scene = testScene();
    class Ball extends Box {
      static override behaviors = [behaviors.bounce({ speed: 600, angle: 0 })];
    }
    class Ghost extends Box {
      static override behaviors = [behaviors.bounce({ speed: 600, angle: 90, edges: false })];
    }
    const ball = scene.spawn(Ball, { x: 620, y: 100 });
    const ghost = scene.spawn(Ghost, { x: 100, y: 340 });
    scene.tick(5);
    expect(ball.velocity.x).toBeLessThan(0);
    expect(ball.behavior(Bounce)).toBeDefined();
    expect(ghost.y).toBeGreaterThan(360);
    const up = scene.spawn(
      class extends Box {
        static override behaviors = [behaviors.bounce({ speed: 600, angle: -90 })];
      },
      { x: 300, y: 20 },
    );
    scene.tick(5);
    expect(up.velocity.y).toBeGreaterThan(0);
  });

  it('followTarget follows a point function, faces it, and stops when the target is gone', () => {
    const scene = testScene();
    let point: { x: number; y: number } | undefined = { x: 100, y: 200 };
    const follower = scene.spawn(
      class extends Box {
        static override behaviors = [
          behaviors.followTarget({ target: () => point, speed: 600, rotate: true }),
        ];
      },
      { x: 100, y: 100 },
    );
    scene.tick(30);
    expect([follower.x, follower.y]).toEqual([100, 200]);
    expect(follower.rotation).toBeCloseTo(Math.PI / 2);
    point = undefined;
    scene.tick();
    expect(follower.velocity.length).toBe(0);
    const target = scene.spawn(Box, { x: 400, y: 100 });
    const chaser = scene.spawn(
      class extends Box {
        static override behaviors = [behaviors.followTarget({ target, speed: 60 })];
      },
      { x: 300, y: 100 },
    );
    target.destroy();
    scene.tick();
    expect(chaser.x).toBe(300);
  });

  it('pathFollow loops, ping-pongs and faces where it goes', () => {
    const scene = testScene();
    const points = [
      { x: 0, y: 0 },
      { x: 60, y: 0 },
    ];
    const looper = scene.spawn(
      class extends Box {
        static override behaviors = [
          behaviors.pathFollow({ points, speed: 600, mode: 'loop', rotate: true }),
        ];
      },
      { x: 0, y: 0 },
    );
    const bouncer = scene.spawn(
      class extends Box {
        static override behaviors = [
          behaviors.pathFollow({ points, speed: 600, mode: 'pingpong' }),
        ];
      },
      { x: 0, y: 0 },
    );
    scene.tick(6); // reached the second point
    expect(looper.x).toBe(60);
    scene.tick(3);
    // The loop jumps back toward the first point; ping-pong walks back.
    expect(looper.x).toBeLessThan(60);
    expect(looper.rotation).toBeCloseTo(Math.PI);
    expect(bouncer.x).toBe(30);
    expect(looper.behavior(PathFollow)!.finished).toBe(false);
    expect(bouncer.behavior(PathFollow)!.finished).toBe(false);
  });

  it('sineWave drives x, alpha, angle or scale', () => {
    const scene = testScene();
    const wave = (property: 'x' | 'alpha' | 'angle' | 'scale', amplitude: number) =>
      scene.spawn(
        class extends Box {
          static override behaviors = [behaviors.sineWave({ property, amplitude, period: 1 })];
        },
        { x: 100, y: 100 },
      );
    const x = wave('x', 10);
    const alpha = wave('alpha', 0.5);
    const angle = wave('angle', 90);
    const scale = wave('scale', 0.5);
    alpha.alpha = 0.5;
    scene.tick(15); // a quarter period: the peak
    expect(x.x).toBeCloseTo(110, 0);
    expect(alpha.alpha).toBeCloseTo(1, 1);
    expect(angle.rotation).toBeCloseTo(Math.PI / 2, 1);
    expect(scale.scale.x).toBeCloseTo(1.5, 1);
  });
});
