/**
 * Rich text markup (UI-09), in the TextMeshPro style that Ink writers already use:
 * `<color=primary>red</color>`, `<shake>`, `<wave>`, `<size=1.5>`, `<b>`, `<i>`, `<u>`,
 * `<speed=0.5>`, and the self-closing `<icon=heart>`, `<input=confirm>` and `<pause=400>`.
 * `\<` writes a literal `<`.
 */

/** Style of a run of text. */
export interface RunStyle {
  color?: string;
  /** CSS font-size value (`1.5em`, `48px`). */
  size?: string;
  bold?: boolean;
  italic?: boolean;
  underline?: boolean;
  /** Per-character animation. */
  effect?: 'shake' | 'wave';
  /** Strength of the effect (1 = default). */
  amplitude?: number;
  /** Typewriter speed multiplier. */
  speed: number;
}

/** A piece of parsed rich text. */
export type RichNode =
  | { kind: 'text'; text: string; style: RunStyle }
  | { kind: 'icon'; name: string; style: RunStyle }
  | { kind: 'input'; action: string; style: RunStyle }
  | { kind: 'pause'; ms: number };

const THEME_COLORS = new Set([
  'background',
  'surface',
  'text',
  'muted',
  'primary',
  'on-primary',
  'accent',
  'focus',
  'danger',
]);

/** CSS color of a `<color=…>` value: theme token, `#hex`, bare hex, or a CSS color name. */
export function colorValue(value: string): string {
  const v = value.trim();
  if (THEME_COLORS.has(v)) return `var(--bl-color-${v})`;
  if (/^[0-9a-f]{3}([0-9a-f]{3}([0-9a-f]{2})?)?$/i.test(v)) return `#${v}`;
  return v;
}

/** CSS size of a `<size=…>` value: `1.5` → `1.5em`, `48px`, `150%`. */
export function sizeValue(value: string): string {
  const v = value.trim();
  return /^\d*\.?\d+$/.test(v) ? `${v}em` : v;
}

const TAG = /^<(\/?)([a-z]+)(?:=("[^"]*"|[^>]*))?>/i;
const PAIRED = new Set(['color', 'size', 'b', 'i', 'u', 'shake', 'wave', 'speed']);
const SINGLE = new Set(['icon', 'input', 'pause']);

/**
 * Parses rich text into runs. Unknown or unbalanced tags are kept as text so a typo shows up on
 * screen instead of vanishing.
 *
 * @example
 * ```ts
 * parseRichText('Press <input=confirm> to <wave>dance</wave>');
 * ```
 */
export function parseRichText(source: string): RichNode[] {
  const nodes: RichNode[] = [];
  const stack: { tag: string; style: RunStyle }[] = [{ tag: '', style: { speed: 1 } }];
  const style = () => stack[stack.length - 1]!.style;
  let text = '';
  const flush = () => {
    if (!text) return;
    const last = nodes[nodes.length - 1];
    if (last?.kind === 'text' && last.style === style()) last.text += text;
    else nodes.push({ kind: 'text', text, style: style() });
    text = '';
  };

  for (let i = 0; i < source.length; ) {
    const char = source[i]!;
    if (char === '\\' && (source[i + 1] === '<' || source[i + 1] === '\\')) {
      text += source[i + 1];
      i += 2;
      continue;
    }
    if (char !== '<') {
      text += char;
      i++;
      continue;
    }
    const match = TAG.exec(source.slice(i));
    const closing = match?.[1] === '/';
    const name = match?.[2]?.toLowerCase() ?? '';
    const raw = match?.[3]?.replace(/^"|"$/g, '');
    if (!match || (!PAIRED.has(name) && !SINGLE.has(name))) {
      text += char;
      i++;
      continue;
    }
    if (closing) {
      const index = stack.findLastIndex((entry) => entry.tag === name);
      if (index <= 0) {
        text += match[0];
      } else {
        flush();
        stack.length = index;
      }
      i += match[0].length;
      continue;
    }
    flush();
    if (SINGLE.has(name)) {
      if (name === 'pause') {
        const ms = raw?.endsWith('s') && !raw.endsWith('ms') ? parseFloat(raw) * 1000 : parseFloat(raw ?? '');
        nodes.push({ kind: 'pause', ms: Number.isFinite(ms) ? ms : 300 });
      } else if (name === 'icon') nodes.push({ kind: 'icon', name: raw ?? '', style: style() });
      else nodes.push({ kind: 'input', action: raw ?? 'confirm', style: style() });
      i += match[0].length;
      continue;
    }
    const next: RunStyle = { ...style() };
    switch (name) {
      case 'color':
        next.color = colorValue(raw ?? 'text');
        break;
      case 'size':
        next.size = sizeValue(raw ?? '1');
        break;
      case 'b':
        next.bold = true;
        break;
      case 'i':
        next.italic = true;
        break;
      case 'u':
        next.underline = true;
        break;
      case 'shake':
      case 'wave':
        next.effect = name;
        next.amplitude = raw ? parseFloat(raw) || 1 : 1;
        break;
      case 'speed':
        next.speed = style().speed * (parseFloat(raw ?? '1') || 1);
        break;
    }
    stack.push({ tag: name, style: next });
    i += match[0].length;
  }
  flush();
  return nodes;
}

/** The text of rich text without tags (backlog search, accessibility labels, voice timing). */
export function plainText(source: string): string {
  return parseRichText(source)
    .map((node) => (node.kind === 'text' ? node.text : ''))
    .join('');
}

const graphemeSegmenter =
  typeof Intl.Segmenter === 'undefined' ? undefined : new Intl.Segmenter(undefined, { granularity: 'grapheme' });

/** User-perceived characters (emoji, combining marks and CJK stay whole). */
export function graphemes(text: string): string[] {
  if (!graphemeSegmenter) return [...text];
  return [...graphemeSegmenter.segment(text)].map((s) => s.segment);
}

/** Characters that take no typewriter time (zero-width spaces added for line breaking). */
const INVISIBLE = /^[​-‍⁠﻿]$/;

/**
 * Reveal schedule of a typewriter: for each visible unit (a character, an icon or a glyph), the
 * time in ms at which it appears. `<speed>` scales the time per character, `<pause>` waits.
 *
 * @param charsPerSecond - `0` (or `Infinity`) shows everything at once.
 */
export function revealSchedule(nodes: RichNode[], charsPerSecond: number): number[] {
  const times: number[] = [];
  const instant = !(charsPerSecond > 0) || !Number.isFinite(charsPerSecond);
  let at = 0;
  for (const node of nodes) {
    if (node.kind === 'pause') {
      if (!instant) at += node.ms;
      continue;
    }
    const units = node.kind === 'text' ? graphemes(node.text) : [''];
    for (const unit of units) {
      if (!instant && !INVISIBLE.test(unit)) at += 1000 / (charsPerSecond * node.style.speed);
      times.push(instant ? 0 : at);
    }
  }
  return times;
}

/** Units of `times` visible at `elapsed` ms. */
export function visibleCount(times: number[], elapsed: number): number {
  let lo = 0;
  let hi = times.length;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (times[mid]! <= elapsed) lo = mid + 1;
    else hi = mid;
  }
  return lo;
}

/** Scripts whose letters join (Arabic, Syriac, N'Ko, Mongolian…): per-character spans would break them. */
export const JOINING_SCRIPT = /[؀-ۿ܀-ݏݐ-ݿ߀-߿ࡠ-ࣿ᠀-᢯ﭐ-﷿ﹰ-﻿]/;
