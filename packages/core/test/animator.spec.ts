import { describe, expect, it, vi } from 'vitest';
import { Animator, findFallback, resolveAnimations } from '../src/anim/animator';
import { gridSheet, parseAseprite, parseGridName } from '../src/anim/sheets';

const sheet = parseAseprite({
  frames: Array.from({ length: 8 }, (_, i) => ({
    frame: { x: i * 16, y: 0, w: 16, h: 16 },
    duration: 100,
  })),
  meta: {
    image: 'hero.png',
    frameTags: [
      { name: 'idle', from: 0, to: 1 },
      { name: 'run', from: 2, to: 5, direction: 'forward' },
      { name: 'wave', from: 6, to: 7, direction: 'pingpong' },
    ],
    slices: [
      {
        name: 'hitbox',
        keys: [{ frame: 0, bounds: { x: 2, y: 4, w: 12, h: 12 }, pivot: { x: 6, y: 12 } }],
      },
    ],
  },
});

describe('sheets', () => {
  it('parses Aseprite tags, durations and slices', () => {
    expect(sheet.frames).toHaveLength(8);
    expect(sheet.frames[0]!.duration).toBe(100);
    expect(sheet.tags.map((t) => t.name)).toEqual(['idle', 'run', 'wave']);
    expect(sheet.slices[0]!.bounds(5)).toEqual({ x: 2, y: 4, width: 12, height: 12 });
    expect(sheet.slices[0]!.pivot(3)).toEqual({ x: 8, y: 16 });
    expect(sheet.image).toBe('hero.png');
  });

  it('parses hash exports too', () => {
    const hash = parseAseprite({
      frames: { 'a 0': { frame: { x: 0, y: 0, w: 8, h: 8 } } },
      meta: {},
    });
    expect(hash.frames[0]!.rect).toEqual({ x: 0, y: 0, width: 8, height: 8 });
  });

  it('reads grid names and cuts grids', () => {
    expect(parseGridName('objects/hero/hero@32x48.png')).toEqual({
      width: 32,
      height: 48,
      spacing: 0,
    });
    expect(parseGridName('hero@16x16+2.png')).toEqual({ width: 16, height: 16, spacing: 2 });
    expect(parseGridName('hero.png')).toBeUndefined();
    expect(gridSheet({ width: 16, height: 16, spacing: 0 }, 64, 32).frames).toHaveLength(8);
    const spaced = gridSheet({ width: 16, height: 16, spacing: 2 }, 2 + 18 * 3, 2 + 18);
    expect(spaced.frames.map((f) => f.rect.x)).toEqual([2, 20, 38]);
  });
});

describe('resolveAnimations', () => {
  it('builds animations from tags, lists and ranges', () => {
    const animations = resolveAnimations(
      {
        fps: 10,
        animations: {
          idle: {},
          run: { fps: 20, events: { '1': 'step' } },
          custom: { frames: [7, 6] },
          range: { frames: { from: 2, to: 3 }, pingPong: true },
          wave: {},
          attack: { frames: 'run', next: 'idle' },
        },
      },
      sheet,
    );
    expect(animations.get('idle')!.frames).toEqual([0, 1]);
    expect(animations.get('idle')!.durations).toEqual([100, 100]);
    expect(animations.get('run')!.durations[0]).toBe(50);
    expect(animations.get('run')!.events.get(1)).toEqual(['step']);
    expect(animations.get('custom')!.frames).toEqual([7, 6]);
    expect(animations.get('range')!.frames).toEqual([2, 3]);
    expect(animations.get('wave')!.frames).toEqual([6, 7]);
    expect(animations.get('attack')!.loop).toBe(false);
  });

  it('explains unknown tags and frames', () => {
    expect(() => resolveAnimations({ animations: { jump: { frames: 'jmp' } } }, sheet)).toThrow(
      /Tags: "idle"/,
    );
    expect(() => resolveAnimations({ animations: { x: { frames: [9] } } }, sheet)).toThrow(
      /frames 0 to 7/,
    );
  });
});

describe('findFallback', () => {
  const has = (names: string[]) => (n: string) => names.includes(n);
  it('finds near, mirrored and base animations', () => {
    expect(findFallback('walk-left', has(['walk-right']), 'idle')).toEqual({
      name: 'walk-right',
      flipX: true,
    });
    expect(findFallback('walk-upleft', has(['walk-up', 'walk-down']), 'idle')).toEqual({
      name: 'walk-up',
      flipX: false,
    });
    expect(findFallback('walk-up', has(['walk']), 'idle')).toEqual({ name: 'walk', flipX: false });
    expect(findFallback('jump', has(['idle']), 'idle')).toEqual({ name: 'idle', flipX: false });
    expect(findFallback('jump', has([]), undefined)).toBeUndefined();
  });
});

describe('Animator', () => {
  const animations = resolveAnimations(
    {
      fps: 10,
      animations: {
        idle: {},
        run: { events: { '2': 'step' } },
        attack: { frames: 'run', next: 'idle' },
      },
    },
    sheet,
  );

  it('advances frames, loops and fires events', () => {
    const frames: number[] = [];
    const events: string[] = [];
    const animator = new Animator(animations, {
      frame: (f, e) => (frames.push(f), events.push(...e)),
      end: () => {},
    });
    animator.play('run');
    animator.step(450);
    expect(frames).toEqual([2, 3, 4, 5, 2]);
    expect(events).toEqual(['step']);
  });

  it('chains to next and calls end', () => {
    const end = vi.fn();
    const animator = new Animator(animations, { frame: () => {}, end });
    animator.play('attack');
    animator.step(400);
    expect(end).toHaveBeenCalledWith('attack');
    expect(animator.name).toBe('idle');
  });

  it('keeps running when played again, restarts on demand, queues', () => {
    const animator = new Animator(animations, { frame: () => {}, end: () => {} });
    animator.play('run');
    animator.step(150);
    animator.play('run');
    expect(animator.index).toBe(1);
    animator.play('run', true);
    expect(animator.index).toBe(0);
    animator.queue('idle');
    animator.step(400);
    expect(animator.name).toBe('idle');
  });

  it('falls back with a warning', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const animator = new Animator(animations, { frame: () => {}, end: () => {} });
    animator.play('jump');
    expect(animator.name).toBe('idle');
    expect(warn).toHaveBeenCalledOnce();
    warn.mockRestore();
  });
});
