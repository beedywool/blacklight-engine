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
      frame: (f) => (frames.push(f.sheetFrame), events.push(...f.events)),
      end: () => {},
    });
    animator.play('run');
    animator.step(450);
    expect(frames).toEqual([2, 3, 4, 5, 2]);
    expect(events).toEqual(['step']);
  });

  it('reports each frame by its index within the animation and in the sheet', () => {
    const frames: unknown[] = [];
    const animator = new Animator(animations, { frame: (f) => frames.push(f), end: () => {} });
    animator.play('run');
    animator.step(200);
    expect(frames).toEqual([
      { animation: 'run', frame: 0, sheetFrame: 2, events: [] },
      { animation: 'run', frame: 1, sheetFrame: 3, events: [] },
      { animation: 'run', frame: 2, sheetFrame: 4, events: ['step'] },
    ]);
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

  describe('ends and queue', () => {
    // 100 ms frames: `once` and `twice` are non-looping, `idle` loops, `attack` chains to idle.
    const set = resolveAnimations(
      {
        fps: 10,
        animations: {
          idle: {},
          once: { frames: [2, 3], loop: false, events: { '1': 'hit' } },
          twice: { frames: [4, 5], loop: false },
          attack: { frames: [6, 7], next: 'idle' },
        },
      },
      sheet,
    );
    function record() {
      const log: string[] = [];
      const animator = new Animator(set, {
        frame: ({ sheetFrame, events }) =>
          log.push(`frame ${sheetFrame}${events.map((e) => ` ${e}`).join('')}`),
        end: (name) => log.push(`end ${name}`),
      });
      return { animator, log };
    }

    it('ends a non-looping animation before the queued one starts', () => {
      const { animator, log } = record();
      animator.play('once');
      animator.queue('twice');
      log.length = 0;
      animator.step(100);
      expect(log).toEqual(['frame 3 hit']);
      animator.step(100);
      expect(log).toEqual(['frame 3 hit', 'end once', 'frame 4']);
      expect(animator.name).toBe('twice');
      expect(animator.finished).toBe(false);
    });

    it('plays a chain of queued animations, each ending once', () => {
      const { animator, log } = record();
      animator.play('once');
      animator.queue('twice');
      animator.queue('once');
      animator.queue('attack');
      for (let i = 0; i < 12; i++) animator.step(100);
      expect(log.filter((l) => l.startsWith('end'))).toEqual([
        'end once',
        'end twice',
        'end once',
        'end attack',
      ]);
      // The queue is empty after attack, so its `next` plays.
      expect(animator.name).toBe('idle');
      expect(animator.finished).toBe(false);
    });

    it('carries the time past the end into the queued animation', () => {
      const { animator, log } = record();
      animator.play('once');
      animator.queue('twice');
      animator.step(350);
      expect(log).toEqual(['frame 2', 'frame 3 hit', 'end once', 'frame 4', 'frame 5']);
      expect(animator.elapsed).toBeCloseTo(50);
      animator.step(1000);
      expect(log.at(-1)).toBe('end twice');
      expect(animator.finished).toBe(true);
    });

    it('lets a queued animation replace next, after the end', () => {
      const { animator, log } = record();
      animator.play('attack');
      animator.queue('twice');
      animator.step(200);
      expect(log.slice(-2)).toEqual(['end attack', 'frame 4']);
      expect(animator.name).toBe('twice');
    });

    it('starts a looping animation queued after a loop completes, without an end', () => {
      const { animator, log } = record();
      animator.play('idle');
      animator.queue('once');
      animator.step(150);
      expect(animator.name).toBe('idle');
      animator.step(50);
      expect(animator.name).toBe('once');
      expect(log).toEqual(['frame 0', 'frame 1', 'frame 2']);
    });

    it('does not end an animation that play() interrupts, and clears the queue', () => {
      const { animator, log } = record();
      animator.play('once');
      animator.queue('twice');
      animator.step(150);
      animator.play('attack');
      animator.step(200);
      expect(log.filter((l) => l.startsWith('end'))).toEqual(['end attack']);
      expect(animator.name).toBe('idle');
    });

    it('fires the end once when the animation stays finished', () => {
      const { animator, log } = record();
      animator.play('twice');
      for (let i = 0; i < 10; i++) animator.step(100);
      expect(log.filter((l) => l === 'end twice')).toHaveLength(1);
      // Queuing after the end plays it at once.
      animator.queue('once');
      expect(animator.name).toBe('once');
    });

    it('lets an end listener choose what plays next', () => {
      const animator: Animator = new Animator(set, {
        frame: () => {},
        end: (name) => {
          if (name === 'once') animator.play('idle');
        },
      });
      animator.play('once');
      animator.queue('twice');
      animator.step(200);
      expect(animator.name).toBe('idle');

      const queued: Animator = new Animator(set, {
        frame: () => {},
        end: (name) => {
          if (name === 'once') queued.queue('attack');
        },
      });
      queued.play('once');
      queued.queue('twice');
      queued.step(200);
      // Queued from the listener: after what was already waiting.
      expect(queued.name).toBe('twice');
      queued.step(200);
      expect(queued.name).toBe('attack');
    });

    it('rejects an animation it cannot play when it is queued', () => {
      const empty = new Animator(new Map(), { frame: () => {}, end: () => {} });
      expect(() => empty.queue('jump')).toThrow(/No animation "jump"/);
    });

    it('captures and restores its queue without firing events', () => {
      const { animator, log } = record();
      animator.play('once');
      animator.queue('twice');
      animator.step(150);
      const saved = animator.capture();
      expect(saved).toMatchObject({ name: 'once', index: 1, queued: ['twice'] });
      animator.play('idle');
      log.length = 0;
      animator.restore(saved);
      expect(log).toEqual([]);
      expect(animator.sheetFrame).toBe(3);
      animator.step(50);
      expect(log).toEqual(['end once', 'frame 4']);
    });
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
