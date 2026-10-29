import { reactive, watch } from 'vue';
import type { Settings } from '@blacklight/core';

/** Color filters for color-blind players: daltonization (colors shifted to stay distinct). */
export type ColorFilter = 'none' | 'protanopia' | 'deuteranopia' | 'tritanopia' | 'grayscale';

/** Accessibility options of the player, saved in settings under `a11y.*` (UI-16). */
export interface AccessibilitySettings {
  /** Multiplies text in rich text, dialogue, subtitles and toasts (`--bl-text-scale`). 0.8–2. */
  textScale: number;
  /** `high` darkens backdrops, outlines text and thickens the focus ring. */
  contrast: 'normal' | 'high';
  /** Filter applied to the whole game (canvas and UI). */
  colorFilter: ColorFilter;
  /** `system` follows `prefers-reduced-motion`; `on` / `off` override it. */
  reducedMotion: 'system' | 'on' | 'off';
  /** Show subtitles for videos and voice lines. */
  subtitles: boolean;
  /** Size multiplier of subtitles. 0.75–2. */
  subtitleSize: number;
  /** Opacity of the box behind subtitles, 0–1. */
  subtitleBackground: number;
  /** Typewriter speed in characters per second; `0` shows text at once. */
  textSpeed: number;
}

/** Defaults of {@link AccessibilitySettings}. */
export const ACCESSIBILITY_DEFAULTS: Readonly<AccessibilitySettings> = Object.freeze({
  textScale: 1,
  contrast: 'normal',
  colorFilter: 'none',
  reducedMotion: 'system',
  subtitles: true,
  subtitleSize: 1,
  subtitleBackground: 0.6,
  textSpeed: 45,
});

/**
 * The player's accessibility options. Reactive: changing a field updates the UI at once and saves
 * it (once the UI layer is installed).
 *
 * @example
 * ```ts
 * import { accessibility } from '@blacklight/ui';
 * accessibility.textScale = 1.25;
 * accessibility.colorFilter = 'deuteranopia';
 * ```
 */
export const accessibility: AccessibilitySettings = reactive({ ...ACCESSIBILITY_DEFAULTS });

let stopSaving: (() => void) | undefined;

/** @internal Reads saved options and saves every later change. */
export function bindAccessibility(settings: Settings): void {
  stopSaving?.();
  for (const key of Object.keys(ACCESSIBILITY_DEFAULTS) as (keyof AccessibilitySettings)[]) {
    const saved = settings.get(`a11y.${key}`);
    const fallback = ACCESSIBILITY_DEFAULTS[key];
    Object.assign(accessibility, {
      [key]: typeof saved === typeof fallback ? saved : fallback,
    });
  }
  stopSaving = watch(
    () => ({ ...accessibility }),
    (now, before) => {
      for (const key of Object.keys(now) as (keyof AccessibilitySettings)[])
        if (now[key] !== before[key]) settings.set(`a11y.${key}`, now[key]);
    },
  );
}

/**
 * `true` when animations should be skipped: the player's option, else the system setting.
 * Transitions, timelines, typewriters and rich-text effects check it.
 */
export function prefersReducedMotion(): boolean {
  if (accessibility.reducedMotion !== 'system') return accessibility.reducedMotion === 'on';
  return (
    typeof matchMedia !== 'undefined' && matchMedia('(prefers-reduced-motion: reduce)').matches
  );
}

type Matrix3 = [number, number, number, number, number, number, number, number, number];

const multiply = (a: Matrix3, b: Matrix3): Matrix3 => {
  const out = new Array<number>(9).fill(0);
  for (let r = 0; r < 3; r++)
    for (let c = 0; c < 3; c++)
      for (let k = 0; k < 3; k++) out[r * 3 + c]! += a[r * 3 + k]! * b[k * 3 + c]!;
  return out as Matrix3;
};

const invert = (m: Matrix3): Matrix3 => {
  const [a, b, c, d, e, f, g, h, i] = m;
  const A = e * i - f * h;
  const B = -(d * i - f * g);
  const C = d * h - e * g;
  const det = a * A + b * B + c * C;
  return [
    A / det,
    -(b * i - c * h) / det,
    (b * f - c * e) / det,
    B / det,
    (a * i - c * g) / det,
    -(a * f - c * d) / det,
    C / det,
    -(a * h - b * g) / det,
    (a * e - b * d) / det,
  ];
};

// Daltonization (Fidaner, Lin and Ozguven): simulate the deficiency in LMS space, then move the
// lost difference into channels the player still sees. Linear, so it folds into one matrix.
const RGB_TO_LMS: Matrix3 = [
  17.8824, 43.5161, 4.11935, 3.45565, 27.1554, 3.86714, 0.0299566, 0.184309, 1.46709,
];
const SIMULATE: Record<'protanopia' | 'deuteranopia' | 'tritanopia', Matrix3> = {
  protanopia: [0, 2.02344, -2.52581, 0, 1, 0, 0, 0, 1],
  deuteranopia: [1, 0, 0, 0.494207, 0, 1.24827, 0, 0, 1],
  tritanopia: [1, 0, 0, 0, 1, 0, -0.395913, 0.801109, 0],
};
const SHIFT: Matrix3 = [0, 0, 0, 0.7, 1, 0, 0.7, 0, 1];
const IDENTITY: Matrix3 = [1, 0, 0, 0, 1, 0, 0, 0, 1];

/**
 * 3×3 RGB matrix of a color filter (row-major). Exposed for shaders and tests.
 *
 * @example
 * ```ts
 * colorFilterMatrix('deuteranopia'); // [r→r, g→r, b→r, r→g, …]
 * ```
 */
export function colorFilterMatrix(filter: ColorFilter): Matrix3 {
  if (filter === 'none') return [...IDENTITY];
  if (filter === 'grayscale')
    return [0.299, 0.587, 0.114, 0.299, 0.587, 0.114, 0.299, 0.587, 0.114];
  const simulate = multiply(invert(RGB_TO_LMS), multiply(SIMULATE[filter], RGB_TO_LMS));
  const error = IDENTITY.map((v, i) => v - simulate[i]!) as Matrix3;
  const correction = multiply(SHIFT, error);
  return IDENTITY.map((v, i) => v + correction[i]!) as Matrix3;
}

const SVG_NS = 'http://www.w3.org/2000/svg';

/** @internal Applies the color filter to `target` through an SVG `feColorMatrix`. */
export function applyColorFilter(target: HTMLElement, filter: ColorFilter): void {
  if (filter === 'none') {
    target.style.removeProperty('filter');
    return;
  }
  const id = `bl-color-filter-${filter}`;
  if (!document.getElementById(id)) {
    let svg: Element | null = document.getElementById('bl-color-filters');
    if (!svg) {
      const created = document.createElementNS(SVG_NS, 'svg');
      created.id = 'bl-color-filters';
      created.setAttribute('aria-hidden', 'true');
      created.setAttribute('style', 'position:absolute;width:0;height:0;overflow:hidden');
      document.body.append(created);
      svg = created;
    }
    const element = document.createElementNS(SVG_NS, 'filter');
    element.id = id;
    element.setAttribute('color-interpolation-filters', 'sRGB');
    const matrix = document.createElementNS(SVG_NS, 'feColorMatrix');
    const m = colorFilterMatrix(filter).map((v) => Number(v.toFixed(5)));
    matrix.setAttribute('type', 'matrix');
    matrix.setAttribute(
      'values',
      [...m.slice(0, 3), 0, 0, ...m.slice(3, 6), 0, 0, ...m.slice(6, 9), 0, 0, 0, 0, 0, 1, 0].join(
        ' ',
      ),
    );
    element.append(matrix);
    svg.append(element);
  }
  target.style.filter = `url(#${id})`;
}
