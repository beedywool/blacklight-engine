import { animate } from 'motion';

/** How a screen enters or leaves. Both functions resolve when the animation is over. */
export interface ScreenTransition {
  enter(element: HTMLElement): Promise<void>;
  leave(element: HTMLElement): Promise<void>;
}

const transitions = new Map<string, ScreenTransition>();

/** Registers a named screen transition, usable as `{ enter: 'name' }`. */
export function defineTransition(name: string, transition: ScreenTransition): void {
  transitions.set(name, transition);
}

export function getTransition(name: string | undefined): ScreenTransition | undefined {
  if (!name || name === 'none') return undefined;
  const transition = transitions.get(name);
  if (!transition) {
    console.warn(
      `[blacklight] Unknown screen transition "${name}". Known: ${[...transitions.keys()].join(', ')}.`,
    );
  }
  return transition;
}

export function transitionNames(): string[] {
  return [...transitions.keys()];
}

const reduced = () =>
  typeof matchMedia !== 'undefined' && matchMedia('(prefers-reduced-motion: reduce)').matches;

function run(
  element: HTMLElement,
  keyframes: Record<string, unknown[]>,
  duration: number,
  ease: [number, number, number, number],
): Promise<void> {
  if (reduced()) {
    const opacity = keyframes.opacity;
    if (opacity) element.style.opacity = String(opacity[opacity.length - 1]);
    return Promise.resolve();
  }
  // A cancelled animation (screen closed mid-way) rejects; the screen is done either way.
  return animate(element, keyframes as never, { duration, ease }).finished.then(
    () => undefined,
    () => undefined,
  );
}

const OUT: [number, number, number, number] = [0.3, 0, 0.8, 0.15];
const IN: [number, number, number, number] = [0.05, 0.7, 0.1, 1];

defineTransition('fade', {
  enter: (el) => run(el, { opacity: [0, 1] }, 0.18, IN),
  leave: (el) => run(el, { opacity: [1, 0] }, 0.12, OUT),
});

for (const [name, axis, sign] of [
  ['slide-left', 'x', -1],
  ['slide-right', 'x', 1],
  ['slide-up', 'y', -1],
  ['slide-down', 'y', 1],
] as const) {
  defineTransition(name, {
    enter: (el) => run(el, { [axis]: [`${-sign * 8}%`, '0%'], opacity: [0, 1] }, 0.24, IN),
    leave: (el) => run(el, { [axis]: ['0%', `${sign * 8}%`], opacity: [1, 0] }, 0.16, OUT),
  });
}

defineTransition('zoom', {
  enter: (el) => run(el, { scale: [1.12, 1], opacity: [0, 1] }, 0.22, IN),
  leave: (el) => run(el, { scale: [1, 0.94], opacity: [1, 0] }, 0.14, OUT),
});

defineTransition('wipe', {
  enter: (el) => run(el, { clipPath: ['inset(0 100% 0 0)', 'inset(0 0% 0 0)'] }, 0.3, IN),
  leave: (el) => run(el, { clipPath: ['inset(0 0 0 0%)', 'inset(0 0 0 100%)'] }, 0.22, OUT),
});

/** Persona-style slash: the screen cuts in on a slanted edge with a skewed overshoot. */
defineTransition('slash', {
  enter: (el) =>
    run(
      el,
      {
        clipPath: [
          'polygon(0 0, 0 0, -20% 100%, -20% 100%)',
          'polygon(0 0, 120% 0, 100% 100%, -20% 100%)',
        ],
        x: ['-6%', '0%'],
        skewX: ['-8deg', '0deg'],
      },
      0.32,
      IN,
    ),
  leave: (el) =>
    run(
      el,
      {
        clipPath: [
          'polygon(0 0, 120% 0, 100% 100%, -20% 100%)',
          'polygon(120% 0, 120% 0, 100% 100%, 100% 100%)',
        ],
        x: ['0%', '6%'],
      },
      0.22,
      OUT,
    ),
});
