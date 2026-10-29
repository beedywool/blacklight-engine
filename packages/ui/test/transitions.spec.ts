import { afterEach, describe, expect, it, vi } from 'vitest';
import { defineComponent, h } from 'vue';
import { accessibility } from '../src/a11y';
import {
  coverTransition,
  defineTransition,
  effectNames,
  getEffect,
  playEffect,
  transitionNames,
} from '../src/transitions';
import { installUi, settle, wait } from './helpers';

const size = (cover = false, direction: 'in' | 'out' = 'in') => ({
  width: 1920,
  height: 1080,
  direction,
  cover,
});

afterEach(() => {
  accessibility.reducedMotion = 'system';
});

describe('transition library (UI-08)', () => {
  it('has every effect of the spec, usable for screens and scenes', () => {
    for (const name of ['wipe', 'shatter', 'ink', 'zoom', 'slices', 'iris', 'fade', 'slash'])
      expect(effectNames()).toContain(name);
    expect(transitionNames()).toEqual(expect.arrayContaining(effectNames()));
  });

  it('draws each effect from hidden to shown', () => {
    const el = document.createElement('div');
    getEffect('iris')!.frame(el, 0.5, size());
    expect(el.style.clipPath).toMatch(/^circle\(\d+(\.\d+)?px at 50% 50%\)$/);
    getEffect('iris')!.frame(el, 0.5, size(true));
    expect(el.style.getPropertyValue('mask-image')).toContain('radial-gradient');

    getEffect('wipe')!.frame(el, 0.25, size());
    expect(el.style.clipPath).toBe('inset(0 75.000% 0 0)');

    getEffect('slices')!.frame(el, 0.5, size());
    expect(el.style.clipPath).toMatch(/^path\('M/);
    expect(el.style.clipPath.match(/M/g)).toHaveLength(7);

    getEffect('ink')!.frame(el, 0.6, size());
    expect(
      el.style.getPropertyValue('mask-image').match(/radial-gradient/g)!.length,
    ).toBeGreaterThan(5);

    getEffect('zoom')!.frame(el, 0, size());
    expect(el.style.opacity).toBe('0');
  });

  it('shatters an element into shards that are removed afterwards', () => {
    const parent = document.createElement('div');
    const el = document.createElement('div');
    el.innerHTML = '<button data-bl-focus>Go</button>';
    parent.append(el);
    const shatter = getEffect('shatter')!;
    shatter.frame(el, 0.3, size());
    const shards = parent.querySelectorAll('.bl-shard');
    expect(shards.length).toBe(24);
    expect(parent.querySelectorAll('.bl-shard [data-bl-focus]')).toHaveLength(0);
    expect(el.style.visibility).toBe('hidden');
    shatter.cleanup!(el);
    expect(parent.querySelectorAll('.bl-shard')).toHaveLength(0);
    expect(el.style.visibility).toBe('');
  });

  it('plays an effect in real time and clears its styles at the end', async () => {
    const el = document.createElement('div');
    const frames: number[] = [];
    defineTransition('test-blinds', {
      duration: 0.05,
      frame: (target, t) => {
        frames.push(t);
        target.style.clipPath = `inset(0 0 ${(1 - t) * 100}% 0)`;
      },
    });
    await playEffect(getEffect('test-blinds')!, el, 0, 1, 'in', false);
    expect(frames[0]).toBeLessThan(0.3);
    expect(frames.at(-1)).toBe(1);
    expect(el.style.clipPath).toBe('');
  });

  it('jumps to the end with reduced motion', async () => {
    accessibility.reducedMotion = 'on';
    const frame = vi.fn();
    await playEffect({ frame }, document.createElement('div'), 0, 1, 'in', false);
    expect(frame).not.toHaveBeenCalled();
  });

  it('turns effects into scene transitions with a full-screen cover', () => {
    const host = document.createElement('div');
    const transition = coverTransition(host, 'iris', { color: '#e60012' });
    transition.draw(undefined as never, 0.5, { width: 1920, height: 1080 });
    const cover = host.querySelector<HTMLElement>('.bl-cover')!;
    expect(cover.style.background).toMatch(/e60012|230, 0, 18/);
    transition.draw(undefined as never, 1, { width: 1920, height: 1080 });
    transition.draw(undefined as never, 0.5, { width: 1920, height: 1080 });
    transition.draw(undefined as never, 0, { width: 1920, height: 1080 });
    expect(host.querySelector('.bl-cover')).toBeNull();
  });

  it('registers every effect as a scene transition of the game (goto)', () => {
    const { game } = installUi();
    for (const name of ['iris', 'ink', 'shatter', 'slices', 'wipe', 'zoom', 'distort'])
      expect(game.transitions.has(name)).toBe(true);
    defineTransition('later', { frame: () => {} });
    expect(game.transitions.has('later')).toBe(true);
  });

  it('screens enter and leave with library effects', async () => {
    const { runtime } = installUi();
    const Menu = defineComponent({ setup: () => () => h('div', { class: 'menu' }, 'Menu') });
    const handle = runtime.global.push(Menu, {}, { enter: 'iris', leave: 'shatter' });
    await settle();
    expect(runtime.element.querySelector('.menu')).not.toBeNull();
    handle.close();
    await wait(450);
    await settle();
    expect(runtime.element.querySelector('.menu')).toBeNull();
    expect(runtime.element.querySelector('.bl-shard')).toBeNull();
  });

  it('covers the screen while a scene changes something', async () => {
    const { runtime } = installUi();
    let covered = false;
    await runtime.cover(
      'ink',
      () => {
        covered = !!runtime.element.querySelector('.bl-cover');
      },
      { duration: 20 },
    );
    expect(covered).toBe(true);
    expect(runtime.element.querySelector('.bl-cover')).toBeNull();
    await expect(runtime.cover('nope', () => {})).rejects.toThrow(
      /Unknown transition effect "nope"/,
    );
  });
});
