import { afterEach, describe, expect, it } from 'vitest';
import { defineComponent, h, ref } from 'vue';
import { accessibility, colorFilterMatrix, prefersReducedMotion } from '../src/a11y';
import { installInspector, inspectElement } from '../src/inspector';
import PauseScreen from '../src/screens/PauseScreen.vue';
import SaveLoadScreen from '../src/screens/SaveLoadScreen.vue';
import SettingsScreen from '../src/screens/SettingsScreen.vue';
import { fileSlots, type SaveSlotInfo, type SaveSlots } from '../src/slots';
import { installUi, settle, wait } from './helpers';

afterEach(() => {
  Object.assign(accessibility, {
    textScale: 1,
    contrast: 'normal',
    colorFilter: 'none',
    reducedMotion: 'system',
    subtitles: true,
    textSpeed: 45,
  });
});

const click = (root: Element, selector: string, index = 0) =>
  root.querySelectorAll<HTMLElement>(selector)[index]!.click();

describe('accessibility (UI-16)', () => {
  it('keeps colors unchanged without a filter and shifts them for color blindness', () => {
    expect(colorFilterMatrix('none')).toEqual([1, 0, 0, 0, 1, 0, 0, 0, 1]);
    const m = colorFilterMatrix('deuteranopia');
    // Gray stays gray: every row sums to 1.
    for (let r = 0; r < 3; r++) expect(m[r * 3]! + m[r * 3 + 1]! + m[r * 3 + 2]!).toBeCloseTo(1, 2);
    expect(m).not.toEqual(colorFilterMatrix('protanopia'));
  });

  it('applies text size, contrast, color filter and reduced motion, and saves them', async () => {
    const { game, runtime } = installUi();
    accessibility.textScale = 1.5;
    accessibility.contrast = 'high';
    accessibility.colorFilter = 'tritanopia';
    accessibility.reducedMotion = 'on';
    await settle();
    const root = runtime.element.querySelector<HTMLElement>('.bl-ui')!;
    expect(root.style.getPropertyValue('--bl-text-scale')).toBe('1.5');
    expect(root.dataset.contrast).toBe('high');
    expect(root.hasAttribute('data-reduced-motion')).toBe(true);
    expect(game.mount.style.filter).toBe('url(#bl-color-filter-tritanopia)');
    expect(document.querySelector('#bl-color-filter-tritanopia feColorMatrix')).not.toBeNull();
    expect(prefersReducedMotion()).toBe(true);
    expect(game.settings.get('a11y.textScale')).toBe(1.5);
    expect(game.settings.get('a11y.colorFilter')).toBe('tritanopia');
    accessibility.colorFilter = 'none';
    await settle();
    expect(game.mount.style.filter).toBe('');
  });
});

describe('ready-made screens (UI-17)', () => {
  it('settings: audio volumes, accessibility options and language apply at once', async () => {
    const { game, runtime } = installUi({
      'locales/en.json': { title: 'Title' },
      'locales/ja.json': { title: 'タイトル' },
    });
    await runtime.ready;
    runtime.global.push(SettingsScreen, {}, { enter: 'none', leave: 'none' });
    await settle();
    const screen = runtime.element.querySelector('.bl-settings')!;
    expect([...screen.querySelectorAll('.bl-tabs__tab')].map((t) => t.textContent?.trim())).toEqual(
      ['AUDIO', 'VIDEO', 'CONTROLS', 'LANGUAGE', 'ACCESSIBILITY'],
    );
    // Music slider: focused first, right raises it.
    const sliders = screen.querySelectorAll<HTMLElement>('.bl-slider');
    expect(sliders).toHaveLength(5);
    runtime.focus.focus(sliders[1]!);
    runtime.focus.move('right');
    await settle();
    expect(game.audio.volume('music')).toBeCloseTo(0.9);

    click(screen, '.bl-tabs__tab', 3);
    await settle();
    const languages = screen.querySelectorAll<HTMLElement>('.bl-settings__language');
    expect([...languages].map((l) => l.dataset.lang)).toEqual(['en', 'ja']);
    languages[1]!.click();
    await settle();
    expect(runtime.i18n.locale.value).toBe('ja');

    click(screen, '.bl-tabs__tab', 4);
    await settle();
    const toggles = screen.querySelectorAll<HTMLElement>('.bl-toggle');
    toggles[0]!.click(); // high contrast
    toggles[1]!.click(); // subtitles
    await settle();
    expect(accessibility.contrast).toBe('high');
    expect(accessibility.subtitles).toBe(false);
    click(screen, '.bl-select', 0); // color filter → next
    await settle();
    expect(accessibility.colorFilter).toBe('protanopia');
  });

  it('settings: controls rebind with the next key pressed', async () => {
    const { game, runtime } = installUi();
    runtime.global.push(SettingsScreen, { tabs: ['controls'] }, { enter: 'none', leave: 'none' });
    await settle();
    const row = runtime.element.querySelector<HTMLElement>('[data-action="jump"]')!;
    row.click();
    await settle();
    expect(row.textContent).toContain('PRESS A KEY');
    game.input.keyDown('KeyJ');
    await settle();
    expect(game.input.bindingsOf('jump')[0]).toBe('KeyJ');
  });

  it('save/load: lists slots, saves with metadata, confirms, loads and deletes', async () => {
    const { game, runtime } = installUi();
    let state = { chapter: 1 };
    const applied: unknown[] = [];
    const slots = fileSlots(game, {
      collect: () => ({ ...state }),
      apply: (data) => void applied.push(data),
      describe: (data) => ({ label: `Chapter ${data.chapter}` }),
    });
    const save = runtime.global.push(
      SaveLoadScreen,
      { mode: 'save', slots, count: 4 },
      { enter: 'none', leave: 'none' },
    );
    await settle();
    const rows = runtime.element.querySelectorAll<HTMLElement>('.bl-slots__slot');
    expect(rows).toHaveLength(4);
    rows[1]!.click();
    await save.result;
    expect((await slots.list()).map((s) => [s.id, s.label])).toEqual([['2', 'Chapter 1']]);

    // The save screen slides out (its own leave transition) before the load screen opens.
    await wait(300);
    state = { chapter: 2 };
    runtime.global.push(SaveLoadScreen, { mode: 'load', slots }, { enter: 'none', leave: 'none' });
    await settle();
    runtime.element.querySelector<HTMLElement>('[data-slot="2"]')!.click();
    await settle();
    // Loading asks first.
    expect(runtime.element.querySelector('.bl-dialog')).not.toBeNull();
    const buttons = runtime.element.querySelectorAll<HTMLElement>('.bl-dialog button');
    buttons[buttons.length - 1]!.click();
    await settle();
    expect(applied).toEqual([{ chapter: 1 }]);

    await slots.delete('2');
    expect(await slots.list()).toEqual([]);
    await expect(slots.load('2')).rejects.toThrow(/Slot "2" is empty/);
    await expect(slots.save('../x', {})).rejects.toThrow(/Invalid slot id/);
  });

  it('save/load works against any SaveSlots implementation', async () => {
    const { runtime } = installUi();
    const store = new Map<string, SaveSlotInfo>([
      ['auto', { id: 'auto', savedAt: 0, label: 'Auto' }],
    ]);
    const slots: SaveSlots = {
      list: async () => [...store.values()],
      save: async (id, meta) => void store.set(id, { id, savedAt: Date.now(), ...meta }),
      load: async () => {},
      delete: async (id) => void store.delete(id),
    };
    runtime.global.push(SaveLoadScreen, { mode: 'load', slots, count: 2 }, { enter: 'none' });
    await settle();
    expect(
      [...runtime.element.querySelectorAll<HTMLElement>('.bl-slots__slot')].map(
        (s) => s.dataset.slot,
      ),
    ).toEqual(['auto', '1', '2']);
  });

  it('pause menu pauses the game, opens settings and resumes', async () => {
    const { game, runtime } = installUi();
    const pause = runtime.global.push(PauseScreen, {}, { enter: 'none', leave: 'none' });
    await settle();
    expect(game.paused).toBe(true);
    const items = [...runtime.element.querySelectorAll<HTMLElement>('.bl-menu__item')];
    // No slots: no save/load; the web cannot quit.
    expect(items.map((i) => i.textContent?.trim())).toEqual(['RESUME', 'SETTINGS', 'TITLE SCREEN']);
    items[1]!.click();
    await settle();
    expect(runtime.element.querySelector('.bl-settings')).not.toBeNull();
    runtime.back();
    await settle();
    runtime.element.querySelectorAll<HTMLElement>('.bl-menu__item')[0]!.click();
    expect(await pause.result).toBe('resume');
    await settle();
    expect(game.paused).toBe(false);
  });
});

describe('dev UI inspector (UI-18)', () => {
  it('shows the hovered component with its props and state, the focus and the stack', async () => {
    const { game, runtime } = installUi();
    const Card = defineComponent({
      name: 'PartyCard',
      props: { hero: String },
      setup(props) {
        const hp = ref(42);
        return () =>
          h('button', { class: 'card', 'data-bl-focus': '' }, `${props.hero} ${hp.value}`);
      },
    });
    const Screen = defineComponent({
      name: 'PartyScreen',
      setup: () => () => h(Card, { hero: 'Mira' }),
    });
    runtime.global.push(Screen, {}, { enter: 'none' });
    await settle();
    const card = runtime.element.querySelector('.card')!;
    const info = inspectElement(card)!;
    expect(info.name).toBe('PartyCard');
    expect(info.path).toEqual(['PartyScreen', 'PartyCard']);
    expect(info.props.hero).toBe('"Mira"');

    const inspector = installInspector(game);
    inspector.toggle();
    const panel = game.mount.querySelector<HTMLElement>('.bl-inspector')!;
    expect(panel.hidden).toBe(false);
    expect(panel.textContent).toContain('PartyScreen #');
    expect(panel.querySelector('.bl-inspector__focus')?.textContent).toContain('button.card');
    window.dispatchEvent(new KeyboardEvent('keydown', { code: 'F9', key: 'F9' }));
    expect(panel.hidden).toBe(true);
    inspector.destroy();
    expect(game.mount.querySelector('.bl-inspector')).toBeNull();
  });
});
