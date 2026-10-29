import { mount } from '@vue/test-utils';
import { afterEach, describe, expect, it } from 'vitest';
import { accessibility } from '../src/a11y';
import RichText from '../src/components/RichText.vue';
import { I18n, isCjk, lineBreaks, textDirection } from '../src/i18n';
import {
  colorValue,
  graphemes,
  parseRichText,
  plainText,
  revealSchedule,
  sizeValue,
  visibleCount,
} from '../src/richtext';
import { installUi, settle, wait } from './helpers';

afterEach(() => {
  accessibility.reducedMotion = 'system';
  accessibility.textSpeed = 45;
});

describe('rich text (UI-09)', () => {
  it('parses color, size, styles, effects, speed, icons, input glyphs and pauses', () => {
    const nodes = parseRichText(
      'A <color=primary>red <b>bold</b></color> <size=1.5>big</size> <wave>wavy</wave> <shake=2>!</shake><pause=300><icon=heart><input=confirm> <speed=0.5>slow</speed>',
    );
    const text = nodes.filter((n) => n.kind === 'text');
    expect(text.find((n) => n.text === 'red ')!.style.color).toBe('var(--bl-color-primary)');
    expect(text.find((n) => n.text === 'bold')!.style).toMatchObject({
      bold: true,
      color: 'var(--bl-color-primary)',
    });
    expect(text.find((n) => n.text === 'big')!.style.size).toBe('1.5em');
    expect(text.find((n) => n.text === 'wavy')!.style.effect).toBe('wave');
    expect(text.find((n) => n.text === '!')!.style).toMatchObject({
      effect: 'shake',
      amplitude: 2,
    });
    expect(text.find((n) => n.text === 'slow')!.style.speed).toBe(0.5);
    expect(nodes).toContainEqual({ kind: 'pause', ms: 300 });
    expect(nodes.some((n) => n.kind === 'icon' && n.name === 'heart')).toBe(true);
    expect(nodes.some((n) => n.kind === 'input' && n.action === 'confirm')).toBe(true);
  });

  it('keeps unknown tags, unbalanced closers and escapes as text', () => {
    expect(plainText('a <blink>b</blink> </b> \\<color=red>')).toBe(
      'a <blink>b</blink> </b> <color=red>',
    );
    expect(colorValue('ff0000')).toBe('#ff0000');
    expect(colorValue('#0f0')).toBe('#0f0');
    expect(colorValue('tomato')).toBe('tomato');
    expect(sizeValue('48px')).toBe('48px');
  });

  it('schedules the typewriter with speed tags and pauses', () => {
    const times = revealSchedule(parseRichText('ab<pause=100><speed=2>cd</speed>'), 10);
    expect(times).toEqual([100, 200, 350, 400]);
    expect(visibleCount(times, 0)).toBe(0);
    expect(visibleCount(times, 200)).toBe(2);
    expect(visibleCount(times, 1000)).toBe(4);
    expect(revealSchedule(parseRichText('abc'), 0)).toEqual([0, 0, 0]);
    // Emoji and combining marks are one character.
    expect(graphemes('e\u0301👍🏽a')).toHaveLength(3);
  });

  it('types text, splits animated runs per character, and skips to the end', async () => {
    const { game, runtime } = installUi();
    void runtime;
    const wrapper = mount(RichText, {
      props: { text: 'Hello <wave>there</wave>', typewriter: 20 },
      global: { provide: { 'blacklight:game': game, 'blacklight:ui': runtime } },
    });
    await wait(120);
    const hidden = () =>
      wrapper
        .findAll('.bl-rt-hidden')
        .map((e) => e.text())
        .join('');
    expect(hidden().length).toBeGreaterThan(0);
    expect(wrapper.findAll('.bl-rt-wave .bl-rt-ch')).toHaveLength(5);
    (wrapper.vm as unknown as { skip(): void }).skip();
    await settle();
    expect(wrapper.findAll('.bl-rt-ch.bl-rt-hidden')).toHaveLength(0);
    expect(wrapper.emitted('done')).toHaveLength(1);
  });

  it('uses the player text speed, and shows everything at once at speed 0', async () => {
    accessibility.textSpeed = 0;
    const wrapper = mount(RichText, { props: { text: 'Instant', typewriter: true } });
    await settle();
    expect(wrapper.find('.bl-rt-hidden').text()).toBe('');
    expect(wrapper.emitted('done')).toHaveLength(1);
  });

  it('never splits joining scripts (Arabic) into per-character elements', () => {
    const wrapper = mount(RichText, { props: { text: '<wave>مرحبا</wave>' } });
    expect(wrapper.findAll('.bl-rt-ch')).toHaveLength(0);
    expect(wrapper.text()).toContain('مرحبا');
  });
});

describe('localization (UI-15)', () => {
  const files = {
    'locales/en.json': {
      menu: { start: 'New game' },
      hello: 'Hello {name}',
      coins: { one: '{count} coin', other: '{count} coins', '=0': 'No coins' },
      only_en: 'English only',
    },
    'locales/ja.json': {
      menu: { start: 'はじめから' },
      hello: 'こんにちは、{name}さん',
      coins: { other: 'コイン{count}枚' },
    },
    'locales/ar.json': {
      menu: { start: 'لعبة جديدة' },
      coins: {
        zero: 'لا عملات',
        one: 'عملة',
        two: 'عملتان',
        few: '{count} عملات',
        many: '{count} عملة',
        other: '{count} عملة',
      },
    },
    'locales/fr.json': { coins: { one: '{count} pièce', other: '{count} pièces' } },
  };

  it('loads one file per language and switches at runtime', async () => {
    const { game, runtime } = installUi(files);
    await runtime.ready;
    const i18n = runtime.i18n;
    expect(i18n.available).toEqual(['ar', 'en', 'fr', 'ja']);
    expect(i18n.t('menu.start')).toBe('New game');
    expect(i18n.t('hello', { name: 'Aoi' })).toBe('Hello Aoi');
    await i18n.setLocale('ja');
    // Japanese gets zero-width spaces between words (line breaking).
    expect(i18n.t('menu.start').replaceAll('\u200b', '')).toBe('はじめから');
    expect(i18n.t('only_en')).toBe('English only');
    expect(game.settings.get('ui.locale')).toBe('ja');
    await settle();
    const root = runtime.element.querySelector('.bl-ui')!;
    expect(root.getAttribute('lang')).toBe('ja');
    expect(root.classList.contains('bl-ui--cjk')).toBe(true);
    await i18n.setLocale('ar');
    await settle();
    expect(root.getAttribute('dir')).toBe('rtl');
    await expect(i18n.setLocale('de')).rejects.toThrow(/No locales\/de\.json/);
  });

  it('picks plural forms with Intl.PluralRules and formats numbers', async () => {
    const { runtime } = installUi(files);
    const i18n = runtime.i18n;
    await i18n.setLocale('en');
    expect(i18n.t('coins', { count: 0 })).toBe('No coins');
    expect(i18n.t('coins', { count: 1 })).toBe('1 coin');
    expect(i18n.t('coins', { count: 1200 })).toBe('1,200 coins');
    await i18n.setLocale('fr');
    expect(i18n.t('coins', { count: 1 })).toBe('1 pièce');
    expect(i18n.t('coins', { count: 2 })).toBe('2 pièces');
    await i18n.setLocale('ar');
    expect(i18n.t('coins', { count: 2 })).toBe('عملتان');
    expect(i18n.t('coins', { count: 3 })).toMatch(/عملات$/);
  });

  it('chooses the saved language, then the browser language, then the config default', () => {
    const { game } = installUi(files);
    const i18n = I18n.fromGame(game);
    expect(i18n.initialLocale(['ja-JP', 'en'])).toBe('ja');
    expect(i18n.initialLocale(['de-DE'])).toBe('en');
    game.settings.set('ui.locale', 'ar');
    expect(i18n.initialLocale(['ja'])).toBe('ar');
  });

  it('falls back to the given text, then the key, for missing messages', () => {
    const i18n = new I18n(undefined);
    expect(i18n.t('nope', {}, 'Default')).toBe('Default');
    expect(i18n.t('missing.key')).toBe('missing.key');
    i18n.add('en', { a: { b: 'deep' } });
    expect(i18n.t('a.b')).toBe('deep');
  });

  it('adds line-break opportunities between Japanese words, not before closing punctuation', () => {
    const text = lineBreaks('今日はいい天気ですね。', 'ja');
    expect(text).toContain('\u200b');
    expect(text.replaceAll('\u200b', '')).toBe('今日はいい天気ですね。');
    expect(text).not.toContain('\u200b。');
    expect(lineBreaks('Hello world', 'en')).toBe('Hello world');
    expect(isCjk('zh-Hant')).toBe(true);
    expect(textDirection('he')).toBe('rtl');
    expect(textDirection('fa-IR')).toBe('rtl');
    expect(textDirection('en')).toBe('ltr');
  });

  it('exposes $t in screen templates', async () => {
    const { runtime } = installUi(files);
    await runtime.ready;
    const { defineComponent, h, getCurrentInstance } = await import('vue');
    const Screen = defineComponent({
      setup() {
        const vm = getCurrentInstance()!.proxy as unknown as { $t(k: string): string };
        return () => h('p', { class: 'greeting' }, vm.$t('menu.start'));
      },
    });
    runtime.global.open(Screen, {}, { enter: 'none' });
    await settle();
    expect(runtime.element.querySelector('.greeting')?.textContent).toBe('New game');
  });
});
