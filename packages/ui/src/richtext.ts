/**
 * Rich text markup (UI-09), in the TextMeshPro style that Ink writers already use:
 * `<color=primary>red</color>`, `<shake>`, `<wave>`, `<size=1.5>`, `<b>`, `<i>`, `<u>`,
 * `<speed=0.5>`, and the self-closing `<icon=heart>`, `<input=confirm>` and `<pause=400>`.
 * `\<` writes a literal `<`.
 */

/** Style of a run of text. */
export interface RunStyle {
  /** CSS color (from `<color=…>`, see {@link colorValue}). */
  color?: string;
  /** CSS font-size value (`1.5em`, `48px`). */
  size?: string;
  /** Inside `<b>`. */
  bold?: boolean;
  /** Inside `<i>`. */
  italic?: boolean;
  /** Inside `<u>`. */
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
  | {
      /** A run of text in one style. */
      kind: 'text';
      /** The text, tags removed. */
      text: string;
      /** Style of the run. */
      style: RunStyle;
    }
  | {
      /** An `<icon=…>`. */
      kind: 'icon';
      /** Icon name (see {@link defineIcon}). */
      name: string;
      /** Style around the icon. */
      style: RunStyle;
    }
  | {
      /** An `<input=…>` prompt glyph. */
      kind: 'input';
      /** Action whose binding is shown for the player's device. */
      action: string;
      /** Style around the glyph. */
      style: RunStyle;
    }
  | {
      /** A `<pause=…>` in the typewriter. */
      kind: 'pause';
      /** Pause length in ms. */
      ms: number;
    };

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

/**
 * CSS color of a `<color=…>` value: theme token, `#hex`, bare hex, or a CSS color name.
 *
 * @example
 * ```ts
 * import { colorValue } from '@blacklight/ui';
 *
 * colorValue('primary'); // 'var(--bl-color-primary)'
 * colorValue('ff0044'); // '#ff0044'
 * ```
 */
export function colorValue(value: string): string {
  const v = value.trim();
  if (THEME_COLORS.has(v)) return `var(--bl-color-${v})`;
  if (/^[0-9a-f]{3}([0-9a-f]{3}([0-9a-f]{2})?)?$/i.test(v)) return `#${v}`;
  return v;
}

/**
 * CSS size of a `<size=…>` value: `1.5` → `1.5em`, `48px`, `150%`.
 *
 * @example
 * ```ts
 * import { sizeValue } from '@blacklight/ui';
 *
 * sizeValue('1.5'); // '1.5em'
 * sizeValue('48px'); // '48px'
 * ```
 */
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

  for (let i = 0; i < source.length;) {
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
        const ms =
          raw?.endsWith('s') && !raw.endsWith('ms')
            ? parseFloat(raw) * 1000
            : parseFloat(raw ?? '');
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

/**
 * The text of rich text without tags (backlog search, accessibility labels, voice timing).
 *
 * @example
 * ```ts
 * import { plainText } from '@blacklight/ui';
 *
 * plainText('<b>Mira</b> waves <icon=heart>'); // 'Mira waves '
 * ```
 */
export function plainText(source: string): string {
  return parseRichText(source)
    .map((node) => (node.kind === 'text' ? node.text : ''))
    .join('');
}

const graphemeSegmenter =
  typeof Intl.Segmenter === 'undefined'
    ? undefined
    : new Intl.Segmenter(undefined, { granularity: 'grapheme' });

/**
 * User-perceived characters (emoji, combining marks and CJK stay whole), for typewriters and
 * character counts that must not split a family emoji or an accented letter.
 *
 * @example
 * ```ts
 * import { graphemes } from '@blacklight/ui';
 *
 * graphemes('e\u0301👨‍👩‍👧'); // ['é', '👨‍👩‍👧']
 * ```
 */
export function graphemes(text: string): string[] {
  if (!graphemeSegmenter) return [...text];
  return [...graphemeSegmenter.segment(text)].map((s) => s.segment);
}

/** Characters that take no typewriter time (zero-width spaces added for line breaking). */
const INVISIBLE = /^[\u200b-\u200d\u2060\ufeff]$/;

/**
 * Reveal schedule of a typewriter: for each visible unit (a character, an icon or a glyph), the
 * time in ms at which it appears. `<speed>` scales the time per character, `<pause>` waits.
 * `<RichText>` uses it; call it for a typewriter of your own.
 *
 * @param charsPerSecond - `0` (or `Infinity`) shows everything at once.
 *
 * @example
 * ```ts
 * import { parseRichText, revealSchedule, visibleCount } from '@blacklight/ui';
 *
 * const times = revealSchedule(parseRichText('Hello<pause=300> there'), 40);
 * const shown = visibleCount(times, elapsedMs); // units to show now
 * ```
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

/**
 * Units of `times` (from {@link revealSchedule}) visible at `elapsed` ms.
 *
 * @example
 * ```ts
 * import { visibleCount } from '@blacklight/ui';
 *
 * visibleCount([0, 25, 50, 75], 60); // 3
 * ```
 */
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
export const JOINING_SCRIPT =
  /[\u0600-\u06ff\u0700-\u074f\u0750-\u077f\u07c0-\u07ff\u0860-\u08ff\u1800-\u18af\ufb50-\ufdff\ufe70-\ufeff]/;
