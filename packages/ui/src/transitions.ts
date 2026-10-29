import { cubicBezier } from 'motion';
import type { Transition } from '@blacklight/core';
import { prefersReducedMotion } from './a11y';

/** How a screen enters or leaves. Both functions resolve when the animation is over. */
export interface ScreenTransition {
  enter(element: HTMLElement): Promise<void>;
  leave(element: HTMLElement): Promise<void>;
}

/** What a {@link TransitionEffect} frame knows about the element it draws. */
export interface EffectFrame {
  /** Layout size of the element in its own (virtual) pixels. */
  width: number;
  height: number;
  /** `in`: appearing (screen enter, scene cover closing); `out`: disappearing. */
  direction: 'in' | 'out';
  /** `true` when the element is a full-screen cover (scene transitions, {@link UiRuntime.cover}). */
  cover: boolean;
}

/**
 * A transition written as one drawing function of progress. Effects work everywhere: as screen
 * enter/leave transitions, as scene transitions (`goto(…, { transition: name })`) and as covers
 * inside a scene. Built-in effects: `fade`, `slide-left`, `slide-right`, `slide-up`, `slide-down`,
 * `zoom`, `wipe`, `slash`, `iris`, `ink`, `slices`, `shatter`.
 *
 * @example
 * ```ts
 * defineTransition('blinds', {
 *   duration: 0.4,
 *   frame(el, t) {
 *     el.style.clipPath = `inset(0 0 ${(1 - t) * 100}% 0)`;
 *   },
 * });
 * ```
 */
export interface TransitionEffect {
  /** Seconds to appear; disappearing takes 75 % of it. @defaultValue `0.3` */
  duration?: number;
  /**
   * Draws `element` at progress `t`: 0 is fully hidden, 1 fully shown. Called every frame with
   * eased progress; set inline styles (clip-path, mask, transform, opacity) on the element.
   */
  frame(element: HTMLElement, t: number, info: EffectFrame): void;
  /** Removes what `frame` added. @defaultValue clears clip-path, mask, transform and opacity */
  cleanup?(element: HTMLElement): void;
}

const screenTransitions = new Map<string, ScreenTransition>();
const effects = new Map<string, TransitionEffect>();

/**
 * Registers a named transition, usable as `{ enter: 'name' }` for screens. An effect (an object
 * with `frame`) also works between scenes once the UI layer is installed.
 *
 * @example
 * ```ts
 * defineTransition('pop', {
 *   enter: (el) => el.animate([{ scale: 0 }, { scale: 1 }], 200).finished.then(() => {}),
 *   leave: (el) => el.animate([{ opacity: 1 }, { opacity: 0 }], 150).finished.then(() => {}),
 * });
 * ```
 */
export function defineTransition(name: string, transition: ScreenTransition | TransitionEffect): void {
  if ('frame' in transition) {
    effects.set(name, transition);
    screenTransitions.set(name, {
      enter: (el) => playEffect(transition, el, 0, 1, 'in', false),
      leave: (el) => playEffect(transition, el, 1, 0, 'out', false),
    });
  } else {
    effects.delete(name);
    screenTransitions.set(name, transition);
  }
  for (const listener of listeners) listener(name);
}

const listeners = new Set<(name: string) => void>();
/** @internal Called for every transition defined later (the runtime registers scene versions). */
export function onTransitionDefined(listener: (name: string) => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/** A screen transition by name; warns and returns `undefined` when it does not exist. */
export function getTransition(name: string | undefined): ScreenTransition | undefined {
  if (!name || name === 'none') return undefined;
  const transition = screenTransitions.get(name);
  if (!transition) {
    console.warn(
      `[blacklight] Unknown screen transition "${name}". Known: ${[...screenTransitions.keys()].join(', ')}.`,
    );
  }
  return transition;
}

/** The effect behind a transition name, `undefined` for promise-only transitions. */
export function getEffect(name: string): TransitionEffect | undefined {
  return effects.get(name);
}

/** Names of every registered transition. */
export function transitionNames(): string[] {
  return [...screenTransitions.keys()];
}

/** Names of the transitions usable between scenes and as covers. */
export function effectNames(): string[] {
  return [...effects.keys()];
}

const EASE_IN = cubicBezier(0.05, 0.7, 0.1, 1);
const EASE_OUT = cubicBezier(0.3, 0, 0.8, 0.15);

const running = new WeakMap<HTMLElement, number>();
let runs = 0;

const STYLE_PROPS = [
  'clip-path',
  'mask-image',
  '-webkit-mask-image',
  'mask-repeat',
  '-webkit-mask-repeat',
  'transform',
  'opacity',
];

function clearStyles(element: HTMLElement): void {
  for (const prop of STYLE_PROPS) element.style.removeProperty(prop);
}

function info(element: HTMLElement, direction: 'in' | 'out', cover: boolean): EffectFrame {
  return {
    width: element.offsetWidth || element.getBoundingClientRect().width,
    height: element.offsetHeight || element.getBoundingClientRect().height,
    direction,
    cover,
  };
}

/**
 * Plays an effect on an element from `from` to `to` (0 hidden, 1 shown), in real time. A newer
 * run on the same element stops the older one.
 */
export function playEffect(
  effect: TransitionEffect,
  element: HTMLElement,
  from: number,
  to: number,
  direction: 'in' | 'out',
  cover: boolean,
  duration = (effect.duration ?? 0.3) * (direction === 'in' ? 1 : 0.75),
): Promise<void> {
  const id = ++runs;
  running.set(element, id);
  const size = info(element, direction, cover);
  const finish = () => {
    (effect.cleanup ?? clearStyles)(element);
    if (to === 0) element.style.visibility = 'hidden';
  };
  if (prefersReducedMotion() || duration <= 0) {
    finish();
    return Promise.resolve();
  }
  const ease = direction === 'in' ? EASE_IN : (x: number) => 1 - EASE_OUT(1 - x);
  const start = performance.now();
  return new Promise((resolve) => {
    const tick = () => {
      if (running.get(element) !== id) return resolve();
      const linear = Math.min(1, (performance.now() - start) / (duration * 1000));
      const t = from + (to - from) * ease(linear);
      try {
        effect.frame(element, t, size);
      } catch (error) {
        console.error('[blacklight] Transition frame failed:', error);
        finish();
        return resolve();
      }
      if (linear < 1) requestAnimationFrame(tick);
      else {
        finish();
        resolve();
      }
    };
    tick();
  });
}

/**
 * A scene transition (core `Transition`) that draws a full-screen cover with an effect inside
 * `host`. The UI layer registers one per effect in `game.transitions`; build your own for another
 * color or duration.
 *
 * @example
 * ```ts
 * game.transitions.set('red-iris', coverTransition(uiOf(game).element, 'iris', { color: '#e60012' }));
 * ```
 */
export function coverTransition(
  host: HTMLElement,
  name: string,
  options: { color?: string; duration?: number } = {},
): Transition {
  let cover: HTMLElement | undefined;
  let last = 0;
  let phase: 'in' | 'out' = 'in';
  const effect = () => {
    const found = effects.get(name);
    if (!found) throw new Error(`Unknown transition effect "${name}". Known: ${effectNames().join(', ')}.`);
    return found;
  };
  return {
    duration: options.duration ?? (effect().duration ?? 0.3) * 1000 * 1.4,
    draw(_layer, progress) {
      const fx = effect();
      if (!cover) {
        cover = createCover(host, options.color);
        last = 0;
        phase = 'in';
      }
      if (progress < last) phase = 'out';
      last = progress;
      const eased = phase === 'in' ? EASE_IN(progress) : 1 - EASE_OUT(1 - progress);
      if (prefersReducedMotion()) {
        clearStyles(cover);
        cover.style.opacity = String(progress);
      } else {
        fx.frame(cover, eased, info(cover, phase, true));
      }
      if (phase === 'out' && progress <= 0) {
        (fx.cleanup ?? clearStyles)(cover);
        cover.remove();
        cover = undefined;
      }
    },
  };
}

/** @internal A full-screen element over the canvas and every screen. */
export function createCover(host: HTMLElement, color = '#000'): HTMLElement {
  const cover = document.createElement('div');
  cover.className = 'bl-cover';
  cover.style.background = color;
  host.append(cover);
  return cover;
}

// Small seeded generator: effects look the same every run (screenshot tests).
function seeded(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const clamp01 = (x: number) => Math.min(1, Math.max(0, x));
const setMask = (el: HTMLElement, value: string) => {
  el.style.setProperty('mask-image', value);
  el.style.setProperty('-webkit-mask-image', value);
  el.style.setProperty('mask-repeat', 'no-repeat');
  el.style.setProperty('-webkit-mask-repeat', 'no-repeat');
};

defineTransition('fade', {
  duration: 0.18,
  frame: (el, t) => (el.style.opacity = String(t)),
});

for (const [name, axis, sign] of [
  ['slide-left', 'X', -1],
  ['slide-right', 'X', 1],
  ['slide-up', 'Y', -1],
  ['slide-down', 'Y', 1],
] as const) {
  defineTransition(name, {
    duration: 0.24,
    frame(el, t, { direction }) {
      const offset = (direction === 'in' ? -sign : sign) * 8 * (1 - t);
      el.style.transform = `translate${axis}(${offset}%)`;
      el.style.opacity = String(t);
    },
  });
}

defineTransition('zoom', {
  duration: 0.22,
  frame(el, t, { direction }) {
    const scale = direction === 'in' ? 1 + 0.12 * (1 - t) : 1 - 0.06 * (1 - t);
    el.style.transform = `scale(${scale})`;
    el.style.opacity = String(t);
  },
});

defineTransition('wipe', {
  duration: 0.3,
  frame(el, t, { direction }) {
    const hidden = `${((1 - t) * 100).toFixed(3)}%`;
    el.style.clipPath = direction === 'in' ? `inset(0 ${hidden} 0 0)` : `inset(0 0 0 ${hidden})`;
  },
});

/** Persona-style slash: the screen cuts in on a slanted edge with a skewed overshoot. */
defineTransition('slash', {
  duration: 0.32,
  frame(el, t, { direction }) {
    const p = (x: number) => `${x.toFixed(3)}%`;
    if (direction === 'in') {
      el.style.clipPath = `polygon(0 0, ${p(120 * t)} 0, ${p(-20 + 120 * t)} 100%, -20% 100%)`;
      el.style.transform = `translateX(${-6 * (1 - t)}%) skewX(${-8 * (1 - t)}deg)`;
    } else {
      const s = 1 - t;
      el.style.clipPath = `polygon(${p(120 * s)} 0, 120% 0, 100% 100%, ${p(-20 + 120 * s)} 100%)`;
      el.style.transform = `translateX(${6 * s}%)`;
    }
  },
});

/** A circle opening from the center; as a cover, a hole closing on the center. */
defineTransition('iris', {
  duration: 0.45,
  frame(el, t, { width, height, cover }) {
    const radius = Math.hypot(width, height) / 2 + 2;
    if (cover) {
      const r = (1 - t) * radius;
      setMask(el, `radial-gradient(circle at 50% 50%, transparent ${r}px, #000 ${r + 1}px)`);
    } else {
      el.style.clipPath = `circle(${(t * radius).toFixed(2)}px at 50% 50%)`;
    }
  },
});

const INK_BLOBS = (() => {
  const random = seeded(7);
  const blobs = Array.from({ length: 9 }, () => ({
    x: 8 + random() * 84,
    y: 8 + random() * 84,
    size: 0.28 + random() * 0.3,
    delay: random() * 0.45,
  }));
  // One late, large blob guarantees full coverage at t = 1.
  blobs.push({ x: 50, y: 50, size: 1.15, delay: 0.3 });
  return blobs;
})();

/** Ink blots spreading until they cover everything. */
defineTransition('ink', {
  duration: 0.6,
  frame(el, t, { width, height }) {
    const extent = Math.hypot(width, height) / 2;
    const layers = INK_BLOBS.map((blob) => {
      const grow = clamp01((t - blob.delay) / (1 - blob.delay));
      const r = Math.max(0, grow * blob.size * extent);
      return `radial-gradient(circle at ${blob.x}% ${blob.y}%, #000 ${r.toFixed(1)}px, transparent ${(r * 1.06 + 0.5).toFixed(1)}px)`;
    });
    setMask(el, layers.join(', '));
  },
});

const SLICES = 7;
const STAGGER = 0.12;

/** Horizontal bands sliding in from alternate sides. */
defineTransition('slices', {
  duration: 0.42,
  frame(el, t, { width, height }) {
    const band = height / SLICES;
    let path = '';
    for (let i = 0; i < SLICES; i++) {
      const f = clamp01(t * (1 + STAGGER * (SLICES - 1)) - i * STAGGER);
      const w = f * width;
      const x0 = i % 2 === 0 ? 0 : width - w;
      const y0 = i * band;
      // Bands overlap by a pixel so no seam shows when fully revealed.
      path += `M${x0.toFixed(1)} ${y0.toFixed(1)}H${(x0 + w).toFixed(1)}V${(y0 + band + 1).toFixed(1)}H${x0.toFixed(1)}Z`;
    }
    el.style.clipPath = `path('${path}')`;
  },
});

interface Shard {
  element: HTMLElement;
  dx: number;
  dy: number;
  rotate: number;
}
const shatterState = new WeakMap<HTMLElement, { shards: Shard[] }>();

function triangles(): { points: [number, number][]; cx: number; cy: number }[] {
  const random = seeded(11);
  const cols = 4;
  const rows = 3;
  const grid: [number, number][][] = [];
  for (let r = 0; r <= rows; r++) {
    grid.push([]);
    for (let c = 0; c <= cols; c++) {
      const edgeX = c === 0 || c === cols;
      const edgeY = r === 0 || r === rows;
      const jx = edgeX ? 0 : (random() - 0.5) * 14;
      const jy = edgeY ? 0 : (random() - 0.5) * 18;
      grid[r]!.push([(c / cols) * 100 + jx, (r / rows) * 100 + jy]);
    }
  }
  const out: { points: [number, number][]; cx: number; cy: number }[] = [];
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const a = grid[r]![c]!;
      const b = grid[r]![c + 1]!;
      const d = grid[r + 1]![c]!;
      const e = grid[r + 1]![c + 1]!;
      const pair: [number, number][][] =
        (r + c) % 2 === 0
          ? [
              [a, b, e],
              [a, e, d],
            ]
          : [
              [a, b, d],
              [b, e, d],
            ];
      for (const points of pair) {
        out.push({
          points,
          cx: (points[0]![0] + points[1]![0] + points[2]![0]) / 3,
          cy: (points[0]![1] + points[1]![1] + points[2]![1]) / 3,
        });
      }
    }
  }
  return out;
}
const SHARDS = triangles();

/**
 * Glass shards: the element breaks into triangles that fly apart (or assemble). Screens are
 * cloned once per shard for the length of the transition.
 */
defineTransition('shatter', {
  duration: 0.5,
  frame(el, t, { width, height }) {
    let state = shatterState.get(el);
    if (!state) {
      const random = seeded(23);
      const parent = el.parentElement;
      if (!parent) return;
      const shards = SHARDS.map(({ points, cx, cy }) => {
        const clone = el.cloneNode(true) as HTMLElement;
        clone.removeAttribute('data-bl-screen');
        for (const node of clone.querySelectorAll('[data-bl-focus], [data-bl-screen]')) {
          node.removeAttribute('data-bl-focus');
          node.removeAttribute('data-bl-screen');
        }
        clone.setAttribute('aria-hidden', 'true');
        clone.inert = true;
        clone.classList.add('bl-shard');
        Object.assign(clone.style, {
          position: 'absolute',
          left: `${el.offsetLeft}px`,
          top: `${el.offsetTop}px`,
          width: `${width}px`,
          height: `${height}px`,
          margin: '0',
          pointerEvents: 'none',
          visibility: 'visible',
          clipPath: `polygon(${points.map(([x, y]) => `${x}% ${y}%`).join(', ')})`,
          transformOrigin: `${cx}% ${cy}%`,
        });
        parent.insertBefore(clone, el.nextSibling);
        const dx = cx - 50 + (random() - 0.5) * 30;
        const dy = cy - 50 + (random() - 0.5) * 30;
        const length = Math.hypot(dx, dy) || 1;
        return {
          element: clone,
          dx: (dx / length) * (0.35 + random() * 0.4),
          dy: (dy / length) * (0.35 + random() * 0.4) + 0.15,
          rotate: (random() - 0.5) * 70,
        };
      });
      state = { shards };
      shatterState.set(el, state);
      el.style.visibility = 'hidden';
    }
    const s = 1 - t;
    for (const shard of state.shards) {
      shard.element.style.transform = `translate(${(shard.dx * s * width).toFixed(1)}px, ${(shard.dy * s * height).toFixed(1)}px) rotate(${(shard.rotate * s).toFixed(2)}deg)`;
      shard.element.style.opacity = String(clamp01(t * 1.6));
    }
  },
  cleanup(el) {
    const state = shatterState.get(el);
    for (const shard of state?.shards ?? []) shard.element.remove();
    shatterState.delete(el);
    el.style.removeProperty('visibility');
    clearStyles(el);
  },
});
