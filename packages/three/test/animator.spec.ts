import { describe, expect, it, vi } from 'vitest';
import { AnimationClip, Group, NumberKeyframeTrack, Object3D } from 'three';
import { ModelAnimator } from '../src/animator';

function rig(): { root: Group; arm: Object3D; clips: AnimationClip[] } {
  const root = new Group();
  const arm = new Object3D();
  arm.name = 'arm';
  root.add(arm);
  const clip = (name: string, duration: number, value: number) =>
    new AnimationClip(name, duration, [
      new NumberKeyframeTrack('arm.position[x]', [0, duration], [0, value]),
    ]);
  return {
    root,
    arm,
    clips: [clip('idle', 1, 1), clip('walk-right', 0.5, 2), clip('wave', 0.5, 3)],
  };
}

describe('ModelAnimator', () => {
  it('plays clips on the fixed step and keeps a playing one running', () => {
    const { root, arm, clips } = rig();
    const animator = new ModelAnimator(root, clips);
    animator.play('idle');
    animator.step(0.5);
    expect(animator.name).toBe('idle');
    expect(animator.time).toBeCloseTo(0.5);
    expect(arm.position.x).toBeCloseTo(0.5);
    animator.play('idle');
    expect(animator.time).toBeCloseTo(0.5);
    animator.play('idle', { restart: true });
    expect(animator.time).toBe(0);
    expect(animator.names).toEqual(['idle', 'walk-right', 'wave']);
  });

  it('falls back to a close name, mirrored when it is the other side', () => {
    const { root, clips } = rig();
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const animator = new ModelAnimator(root, clips, {}, 'Robot');
    animator.play('walk-left');
    expect(animator.name).toBe('walk-right');
    expect(animator.flipX).toBe(true);
    animator.play('walk-left');
    animator.play('jump');
    expect(animator.name).toBe('idle');
    expect(warn).toHaveBeenCalledTimes(2);
    expect(warn.mock.calls[0]![0]).toMatch(/Robot has no animation "walk-left"/);
    warn.mockRestore();
  });

  it('chains non-looping clips with next and queue, and reports their end', () => {
    const { root, clips } = rig();
    const animator = new ModelAnimator(root, clips, { wave: { next: 'idle' } });
    const ended: string[] = [];
    animator.onEnd((name) => ended.push(name));
    animator.play('wave', { fade: 0 });
    for (let i = 0; i < 40; i++) animator.step(1 / 60);
    expect(ended).toEqual(['wave']);
    expect(animator.name).toBe('idle');

    animator.play('wave', { loop: false, fade: 0 });
    animator.queue('walk-right');
    for (let i = 0; i < 40; i++) animator.step(1 / 60);
    expect(animator.name).toBe('walk-right');
  });

  it('ends each clip of a queue once, after its last events and before the next clip', () => {
    const { root, clips } = rig();
    const animator = new ModelAnimator(root, clips, {
      wave: { loop: false, events: { 0.5: 'last' } },
      'walk-right': { loop: false },
    });
    const log: string[] = [];
    animator.onEnd((name) => log.push(`end ${name}`));
    animator.onEvent(({ event, animation }) => log.push(`${event} ${animation}`));
    animator.play('wave', { fade: 0 });
    animator.queue('walk-right');
    animator.queue('wave');
    animator.queue('idle');
    for (let i = 0; i < 120; i++) animator.step(1 / 60);
    expect(log).toEqual(['last wave', 'end wave', 'end walk-right', 'last wave', 'end wave']);
    expect(animator.name).toBe('idle');
  });

  it('does not end a clip that play() replaces, and play() clears the queue', () => {
    const { root, clips } = rig();
    const animator = new ModelAnimator(root, clips, { wave: { loop: false } });
    const ended = vi.fn();
    animator.onEnd(ended);
    animator.play('wave', { fade: 0 });
    animator.queue('walk-right');
    animator.step(0.2);
    animator.play('idle', { fade: 0 });
    for (let i = 0; i < 60; i++) animator.step(1 / 60);
    expect(ended).not.toHaveBeenCalled();
    expect(animator.name).toBe('idle');
  });

  it('starts a queued clip when a looping clip completes its loop', () => {
    const { root, clips } = rig();
    const animator = new ModelAnimator(root, clips, { idle: { events: { 0.9: 'late' } } });
    const events: string[] = [];
    animator.onEvent(({ event }) => events.push(event));
    animator.play('idle', { fade: 0 });
    animator.queue('wave');
    animator.step(0.5);
    expect(animator.name).toBe('idle');
    animator.step(0.6);
    expect(animator.name).toBe('wave');
    // The events up to the end of the loop fire, none from a loop that does not happen.
    expect(events).toEqual(['late']);
  });

  it('lets an end listener choose what plays next', () => {
    const { root, clips } = rig();
    const animator = new ModelAnimator(root, clips, { wave: { loop: false, next: 'idle' } });
    animator.onEnd((name) => {
      if (name === 'wave') animator.play('walk-right', { fade: 0 });
    });
    animator.play('wave', { fade: 0 });
    animator.queue('idle');
    for (let i = 0; i < 40; i++) animator.step(1 / 60);
    expect(animator.name).toBe('walk-right');
  });

  it('fires events when playback passes their time, also across the loop', () => {
    const { root, clips } = rig();
    const animator = new ModelAnimator(root, clips, {
      idle: { events: { 0.25: 'step', 0.9: ['step', 'land'] } },
    });
    const events: string[] = [];
    const fired: unknown[] = [];
    animator.onEvent((event) => (events.push(event.event), fired.push(event)));
    animator.play('idle');
    animator.step(0.2);
    expect(events).toEqual([]);
    animator.step(0.1);
    expect(events).toEqual(['step']);
    expect(fired).toEqual([{ event: 'step', animation: 'idle', time: 0.25 }]);
    animator.step(0.8); // 1.1 → wraps to 0.1, passing 0.9
    expect(events).toEqual(['step', 'step', 'land']);
  });

  it('captures and restores its state', () => {
    const { root, arm, clips } = rig();
    const animator = new ModelAnimator(root, clips);
    animator.play('walk-left', { speed: 2 });
    animator.queue('wave');
    animator.step(0.1);
    const saved = animator.capture();
    expect(saved).toMatchObject({ name: 'walk-right', speed: 2, flipX: true, queued: ['wave'] });
    animator.play('idle', { fade: 0 });
    animator.step(0.3);
    animator.restore(saved);
    expect(animator.name).toBe('walk-right');
    expect(animator.time).toBeCloseTo(0.2);
    expect(arm.position.x).toBeCloseTo(0.8);
    animator.step(0.2);
    expect(animator.name).toBe('wave');
    animator.restore({ name: undefined, time: 0, speed: 1, flipX: false });
    expect(animator.name).toBeUndefined();
  });

  it('explains a model without animations', () => {
    expect(() => new ModelAnimator(new Group(), [], {}, 'Crate').play('spin')).toThrow(
      /Crate cannot play "spin": its model has no animations/,
    );
  });
});
