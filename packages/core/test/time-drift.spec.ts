import { describe, expect, it, vi } from 'vitest';
import { Animator, resolveAnimations } from '../src/anim/animator';
import { gridSheet } from '../src/anim/sheets';
import { behaviors, Flash } from '../src/behaviors/index';
import { Camera } from '../src/camera';
import { GameObject } from '../src/objects/game-object';
import { Random } from '../src/random';
import { Timers } from '../src/timers';
import { Tween } from '../src/tween';
import { testScene } from './helpers';

// Game time adds up one fixed step at a time, and 1000 / 60 is not exact in binary: twelve steps
// make 199.99999999999997 ms. Every accumulator must still land on the step a whole number of
// milliseconds asks for, over minutes of play.
const STEP_MS = 1000 / 60;

/** Steps (1-based) on which `fired` turned true, over `steps` steps. */
function stepsWhere(steps: number, step: () => void, fired: () => boolean): number[] {
  const hits: number[] = [];
  for (let i = 1; i <= steps; i++) {
    step();
    if (fired()) hits.push(i);
  }
  return hits;
}

const multiples = (every: number, upTo: number) =>
  Array.from({ length: Math.floor(upTo / every) }, (_, i) => (i + 1) * every);

describe('time accumulators on 60 Hz steps', () => {
  it('fires timers on the exact step', () => {
    const timers = new Timers();
    let fired = false;
    timers.every(100, () => (fired = true));
    const once = vi.fn();
    timers.after(1000, once);
    const hits = stepsWhere(
      3600,
      () => {
        fired = false;
        timers.advance(STEP_MS);
        if (timers.now >= 1000 - 1 && timers.now < 1000 + 1) expect(once).toHaveBeenCalledOnce();
      },
      () => fired,
    );
    expect(hits).toEqual(multiples(6, 3600));
  });

  it('shows animation frames on the exact step, at every tick rate', () => {
    const sheet = gridSheet({ width: 16, height: 16, spacing: 0 }, 64, 16);
    // [tick rate, fps]: pairs where the frame lasts a whole number of steps.
    for (const [rate, fps] of [
      [60, 5],
      [60, 10],
      [60, 12],
      [120, 10],
      [144, 8],
    ] as const) {
      const animations = resolveAnimations({ fps, animations: { spin: {} } }, sheet);
      let changed = false;
      const animator = new Animator(animations, { frame: () => (changed = true), end: () => {} });
      animator.play('spin');
      const hits = stepsWhere(
        rate * 60,
        () => {
          changed = false;
          animator.step(1000 / rate);
        },
        () => changed,
      );
      expect(hits, `${fps} fps at ${rate} Hz`).toEqual(multiples(rate / fps, rate * 60));
    }
  });

  it('completes tweens on the step their duration and delay ask for', () => {
    for (let duration = 100; duration <= 2000; duration += 100) {
      const target = { value: 0 };
      const tween = new Tween(target, { value: 1 }, { duration, delay: duration, ease: 'linear' });
      const steps = (duration / 1000) * 60;
      for (let i = 0; i < steps; i++) tween.step(STEP_MS);
      // The delay is over: the tween starts from its first value, and moves on the next step.
      expect(target.value).toBeCloseTo(0, 10);
      tween.step(STEP_MS);
      expect(target.value).toBeGreaterThan(0);
      for (let i = 1; i < steps - 1; i++) tween.step(STEP_MS);
      expect(tween.done).toBe(false);
      tween.step(STEP_MS);
      expect(tween.done).toBe(true);
      expect(target.value).toBe(1);
    }
  });

  it('flashes, fades and waits for whole numbers of steps', () => {
    class Blinker extends GameObject {
      static override behaviors = [behaviors.flash({ interval: 100, autoStart: 2000 })];
    }
    class Ghost extends GameObject {
      static override behaviors = [behaviors.fade({ fadeOut: 1000 })];
    }
    class Guard extends GameObject {
      static override behaviors = [behaviors.patrol({ distance: 10, speed: 600, wait: 1000 })];
    }
    const scene = testScene();
    const blinker = scene.spawn(Blinker);
    const ghost = scene.spawn(Ghost);
    const guard = scene.spawn(Guard);
    const flash = blinker.behavior(Flash)!;
    let visible = blinker.visible;
    let guardX = guard.x;
    const toggles: number[] = [];
    const guardMoves: number[] = [];
    let flashEnd = 0;
    let ghostGone = 0;
    for (let i = 1; i <= 150; i++) {
      scene.tick();
      if (blinker.visible !== visible) toggles.push(i);
      visible = blinker.visible;
      if (!flash.flashing && !flashEnd) flashEnd = i;
      if (!ghost.alive && !ghostGone) ghostGone = i;
      if (guard.x !== guardX) guardMoves.push(i);
      guardX = guard.x;
    }
    // Off from the first step, then on and off every 100 ms (six steps) for 2 s (120 steps).
    expect(toggles.slice(0, 3)).toEqual([1, 6, 12]);
    expect(toggles.slice(1).filter((step) => step % 6 !== 0)).toEqual([]);
    expect(flashEnd).toBe(120);
    expect(blinker.visible).toBe(true);
    // Fades out over 1 s: gone on step 60.
    expect(ghostGone).toBe(60);
    // Walks 10 px in one step, waits 1 s (60 steps), walks back 20 px in two steps, waits again.
    expect(guardMoves.slice(0, 4)).toEqual([1, 62, 63, 124]);
  });

  it('stops a camera shake after a whole number of steps', () => {
    const random = new Random('shake');
    const camera = new Camera(
      () => ({ width: 320, height: 180 }),
      () => random,
    );
    camera.shake(4, 200);
    let steps = 0;
    for (let i = 0; i < 20; i++) {
      camera.step(STEP_MS);
      if (camera.shakeOffset.x !== 0 || camera.shakeOffset.y !== 0) steps = i + 1;
    }
    // The last step with any shake is the 11th: on the 12th, 200 ms have passed.
    expect(steps).toBe(11);
  });
});
