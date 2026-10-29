import { shallowRef, triggerRef } from 'vue';
import type { Game } from '@blacklight/core';

/** One language file: nested keys, strings or plural forms. */
export interface Messages {
  [key: string]: string | Messages | PluralForms;
}

/**
 * Plural forms of one message, chosen with `Intl.PluralRules` from `count`. `=0`, `=1`… match an
 * exact count first.
 */
export interface PluralForms {
  zero?: string;
  one?: string;
  two?: string;
  few?: string;
  many?: string;
  other: string;
  [exact: `=${number}`]: string;
}

/** Values interpolated into `{name}` placeholders. Numbers are formatted for the language. */
export type MessageValues = Record<string, string | number>;

const RTL = new Set([
  'ar',
  'arc',
  'dv',
  'fa',
  'ha',
  'he',
  'iw',
  'ks',
  'ku',
  'ps',
  'sd',
  'ur',
  'ug',
  'yi',
]);
const NO_SPACES = new Set(['ja', 'zh', 'yue']);
const ZWSP = '\u200b';

/** Base language of a tag: `pt-BR` → `pt`. */
const base = (lang: string) => lang.toLowerCase().split(/[-_]/)[0]!;

/** `rtl` for Arabic, Hebrew, Persian, Urdu…; `ltr` otherwise. */
export function textDirection(lang: string): 'ltr' | 'rtl' {
  try {
    const info = (
      new Intl.Locale(lang) as Intl.Locale & { getTextInfo?(): { direction?: string } }
    ).getTextInfo?.();
    if (info?.direction === 'rtl' || info?.direction === 'ltr') return info.direction;
  } catch {
    // Invalid tag: fall back to the list.
  }
  return RTL.has(base(lang)) ? 'rtl' : 'ltr';
}

/** `true` for languages written without spaces between words (Japanese, Chinese). */
export function isCjk(lang: string): boolean {
  return NO_SPACES.has(base(lang));
}

const segmenters = new Map<string, Intl.Segmenter>();
// Closing punctuation must stay on the line of the word before it (kinsoku shori).
const CLOSING = /^[、。，．・：；？！ー）」』】〕〉》〙〗’”…‥〜!?,.)\]}\s]/;

/**
 * Inserts line-break opportunities (zero-width spaces) between words of Japanese and Chinese text,
 * found with `Intl.Segmenter`. With `word-break: keep-all` (set on the UI root for these
 * languages), lines then break between words instead of inside them. Other languages are returned
 * unchanged.
 *
 * @example
 * ```ts
 * lineBreaks('今日はいい天気ですね', 'ja'); // '今日\u200bは\u200bいい\u200b天気\u200bです\u200bね'
 * ```
 */
export function lineBreaks(text: string, lang: string): string {
  if (!isCjk(lang) || typeof Intl.Segmenter === 'undefined' || text.includes(ZWSP)) return text;
  let segmenter = segmenters.get(lang);
  if (!segmenter)
    segmenters.set(lang, (segmenter = new Intl.Segmenter(lang, { granularity: 'word' })));
  let out = '';
  for (const { segment } of segmenter.segment(text)) {
    if (out && !CLOSING.test(segment) && !/\s$/.test(out)) out += ZWSP;
    out += segment;
  }
  return out;
}

/** The language of a locale file path: `locales/pt-BR.json` → `pt-BR`. */
const LOCALE_FILE = /^locales\/([^/]+)\.json$/;

/**
 * Translations of the game: one JSON file per language in `locales/`, plurals with
 * `Intl.PluralRules`, `{name}` interpolation, language switch at runtime (saved in settings),
 * text direction and CJK line breaking. Installed by the UI layer as `uiOf(game).i18n`; screens use
 * `t()` or `$t()` in templates.
 *
 * @example
 * ```json
 * // locales/en.json
 * { "menu": { "start": "New game" }, "coins": { "one": "{count} coin", "other": "{count} coins" } }
 * ```
 * ```ts
 * t('menu.start');            // 'New game'
 * t('coins', { count: 3 });   // '3 coins'
 * await i18n.setLocale('ja');
 * ```
 */
export class I18n {
  /** Current language tag (reactive). */
  readonly locale = shallowRef('en');
  /** Bumped when messages change, so templates that call `t()` re-render. */
  readonly version = shallowRef(0);
  private readonly messages = new Map<string, Messages>();
  private readonly builtins = new Map<string, Messages>();
  private readonly warned = new Set<string>();
  private plurals: Intl.PluralRules | undefined;
  private numbers: Intl.NumberFormat | undefined;

  constructor(
    private readonly game: Pick<Game, 'assets' | 'settings' | 'config'> | undefined,
    /** Languages with a file in `locales/`. */
    readonly available: string[] = [],
    /** Language that fills missing keys. */
    readonly fallback = 'en',
  ) {}

  /** Languages found in the game's asset manifest (`locales/<lang>.json`). */
  static fromGame(game: Game): I18n {
    // Test doubles and headless tools may have no asset store.
    const available = ((game.assets as Game['assets'] | undefined)?.paths ?? [])
      .map((p) => LOCALE_FILE.exec(p)?.[1])
      .filter((lang): lang is string => !!lang)
      .sort();
    return new I18n(game, available, game.config.locales?.fallback ?? 'en');
  }

  /** Text direction of the current language. */
  get dir(): 'ltr' | 'rtl' {
    return textDirection(this.locale.value);
  }

  /**
   * Picks the starting language: the saved choice, else the browser's languages, else
   * `locales.default` of the config, else the first file.
   */
  initialLocale(preferred: readonly string[] = globalThis.navigator?.languages ?? []): string {
    const saved = this.game?.settings.get<string>('ui.locale');
    if (saved && this.available.includes(saved)) return saved;
    for (const lang of preferred) {
      const exact = this.available.find((a) => a.toLowerCase() === lang.toLowerCase());
      if (exact) return exact;
      const loose = this.available.find((a) => base(a) === base(lang));
      if (loose) return loose;
    }
    const configured = this.game?.config.locales?.default;
    if (configured && this.available.includes(configured)) return configured;
    return this.available.includes('en') ? 'en' : (this.available[0] ?? 'en');
  }

  /** Loads a language file (and the fallback) without switching. */
  async load(lang: string): Promise<void> {
    const wanted = [lang, this.fallback].filter(
      (l, i, all) => all.indexOf(l) === i && !this.messages.has(l) && this.available.includes(l),
    );
    if (!this.game || wanted.length === 0) return;
    const paths = wanted.map((l) => `locales/${l}.json`);
    await this.game.assets.load(paths);
    for (const [i, l] of wanted.entries())
      this.messages.set(l, this.game.assets.getJson<Messages>(paths[i]!));
  }

  /**
   * Switches language: loads its file, updates every `t()` and saves the choice.
   *
   * @throws Error when there is no `locales/<lang>.json`.
   */
  async setLocale(lang: string, options: { save?: boolean } = {}): Promise<void> {
    if (this.available.length > 0 && !this.available.includes(lang)) {
      throw new Error(
        `No locales/${lang}.json. Available languages: ${this.available.join(', ') || 'none'}. Add the file or pick one of these.`,
      );
    }
    await this.load(lang);
    this.locale.value = lang;
    this.plurals = undefined;
    this.numbers = undefined;
    if (options.save !== false) this.game?.settings.set('ui.locale', lang);
    this.version.value++;
  }

  /** Adds or replaces messages for a language (tests, generated text, engine defaults). */
  add(lang: string, messages: Messages, options: { builtin?: boolean } = {}): void {
    const store = options.builtin ? this.builtins : this.messages;
    store.set(lang, merge(store.get(lang) ?? {}, messages));
    this.version.value++;
    triggerRef(this.version);
  }

  /** `true` when `key` has a message in the current or fallback language. */
  has(key: string): boolean {
    return this.lookup(key) !== undefined;
  }

  /**
   * The message `key` (dotted path) in the current language, with `{name}` placeholders filled,
   * the plural form chosen from `values.count`, and CJK line-break opportunities added. Missing
   * keys fall back to the fallback language, then to `fallbackText`, then to the key itself.
   */
  t(key: string, values: MessageValues = {}, fallbackText?: string): string {
    void this.version.value;
    const found = this.lookup(key);
    let message: string;
    if (found === undefined) {
      if (fallbackText === undefined && !this.warned.has(key)) {
        this.warned.add(key);
        console.warn(
          `[blacklight] Missing translation "${key}" for "${this.locale.value}". Add it to locales/${this.locale.value}.json.`,
        );
      }
      message = fallbackText ?? key;
    } else if (typeof found === 'string') {
      message = found;
    } else {
      message = this.pluralForm(found as PluralForms, values.count);
    }
    return lineBreaks(this.format(message, values), this.locale.value);
  }

  /** Formats a number for the current language. */
  number(value: number, options?: Intl.NumberFormatOptions): string {
    if (options) return new Intl.NumberFormat(this.locale.value, options).format(value);
    this.numbers ??= new Intl.NumberFormat(this.locale.value);
    return this.numbers.format(value);
  }

  /** Name of a language in the current language (`ja` → "Japanese", or "日本語" in Japanese). */
  languageName(lang: string, inOwnLanguage = false): string {
    try {
      const names = new Intl.DisplayNames([inOwnLanguage ? lang : this.locale.value], {
        type: 'language',
      });
      return names.of(lang) ?? lang;
    } catch {
      return lang;
    }
  }

  private lookup(key: string): string | Messages | PluralForms | undefined {
    for (const store of [this.messages, this.builtins]) {
      for (const lang of [this.locale.value, base(this.locale.value), this.fallback]) {
        const found = path(store.get(lang), key);
        if (found !== undefined) return found;
      }
    }
    return undefined;
  }

  private pluralForm(forms: PluralForms, count: string | number | undefined): string {
    const n = typeof count === 'number' ? count : Number(count ?? 0);
    const exact = forms[`=${n}`];
    if (exact !== undefined) return exact;
    if (n === 0 && forms.zero !== undefined) return forms.zero;
    this.plurals ??= new Intl.PluralRules(this.locale.value);
    const category = this.plurals.select(n) as keyof PluralForms;
    return (forms[category] as string | undefined) ?? forms.other;
  }

  private format(message: string, values: MessageValues): string {
    return message.replace(/\{(\w+)\}/g, (match, name: string) => {
      const value = values[name];
      if (value === undefined) return match;
      return typeof value === 'number' ? this.number(value) : value;
    });
  }
}

type Entry = string | Messages | PluralForms;

function path(messages: Messages | undefined, key: string): Entry | undefined {
  if (!messages) return undefined;
  if (key in messages) return messages[key];
  let node: Entry | undefined = messages;
  for (const part of key.split('.')) {
    if (typeof node !== 'object' || node === null) return undefined;
    node = (node as Messages)[part];
  }
  return node;
}

function merge(target: Messages, source: Messages): Messages {
  const out: Messages = { ...target };
  for (const [key, value] of Object.entries(source)) {
    const existing = out[key];
    out[key] =
      typeof value === 'object' && typeof existing === 'object' && !('other' in value)
        ? merge(existing as Messages, value as Messages)
        : value;
  }
  return out;
}

let current: I18n = new I18n(undefined);

/** @internal The translations used by {@link t}. */
export function setCurrentI18n(i18n: I18n): void {
  current = i18n;
}

/** The game's translations (`uiOf(game).i18n` of the running game). */
export function useI18n(): I18n {
  return current;
}

/**
 * Translates `key` in the current language. See {@link I18n.t}.
 *
 * @example
 * ```vue
 * <button>{{ t('menu.start') }}</button>
 * <p>{{ t('coins', { count: coins }) }}</p>
 * ```
 */
export function t(key: string, values?: MessageValues, fallbackText?: string): string {
  return current.t(key, values, fallbackText);
}
