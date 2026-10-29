import { describe, expect, it, vi } from 'vitest';
import { defineComponent, h } from 'vue';
import { FOCUS_ATTR } from '../src/focus';
import { getTheme, resolveTheme, themeVariables } from '../src/theme';
import { bindingForDevice, glyphFor, kenneyFile, padFamily } from '../src/prompts';
import { Timeline } from '../src/timeline';
import { UiRuntime } from '../src/runtime';
import { installUi, place, settle } from './helpers';

const Menu = defineComponent({
  props: { title: String },
  setup: (props) => () =>
    h('div', { class: 'menu' }, [
      h('h1', props.title),
      h(
        'button',
        { id: 'first', [FOCUS_ATTR]: '', ref: (el) => el && place(el as Element, 0, 0) },
        'One',
      ),
      h(
        'button',
        { id: 'second', [FOCUS_ATTR]: '', ref: (el) => el && place(el as Element, 0, 60) },
        'Two',
      ),
    ]),
});
const Hud = defineComponent({ setup: () => () => h('div', { class: 'hud' }, 'HUD') });

describe('UiRuntime', () => {
  it('opens, pushes and pops screens; push hides and blocks game input', async () => {
    const { runtime, game } = installUi();
    runtime.global.open(Hud);
    const menu = runtime.global.push(Menu, { title: 'Pause' }, { enter: 'none', leave: 'none' });
    await settle();
    expect(runtime.element.querySelector('h1')?.textContent).toBe('Pause');
    expect(game.input.blocked).toBe(true);
    expect(
      runtime.element.querySelector('.bl-screen--open')?.classList.contains('bl-screen--hidden'),
    ).toBe(true);
    expect(runtime.focus.current.value?.id).toBe('first');

    menu.close('resume');
    await expect(menu.result).resolves.toBe('resume');
    await settle();
    expect(game.input.blocked).toBe(false);
    expect(runtime.element.querySelector('h1')).toBeNull();
  });

  it('navigates with actions, confirms and closes with back', async () => {
    const { runtime, game } = installUi();
    const menu = runtime.global.push(Menu, {}, { enter: 'none', leave: 'none' });
    await settle();
    game.input.keyDown('ArrowDown');
    game.stepOnce();
    expect(runtime.focus.current.value?.id).toBe('second');
    game.input.keyUp('ArrowDown');
    game.stepOnce();
    game.input.keyDown('Escape');
    game.stepOnce();
    await expect(menu.result).resolves.toBeUndefined();
  });

  it('modals resolve with their result and confirm() returns booleans', async () => {
    const { runtime, game } = installUi();
    const answer = runtime.global.confirm({ message: 'Quit?' });
    await settle();
    expect(runtime.element.querySelector('.bl-dialog__message')?.textContent).toBe('Quit?');
    game.input.keyDown('Enter');
    game.stepOnce();
    await expect(answer).resolves.toBe(false); // Cancel has autofocus
  });

  it('resolves named screens and scene screens close with their scene', async () => {
    const { runtime } = installUi();
    expect(() => runtime.global.open('Missing')).toThrow(/Unknown screen "Missing"/);
    const scene = { name: 'level' } as never;
    runtime.forScene(scene).open(Hud);
    await settle();
    expect(runtime.entries).toHaveLength(1);
    runtime.sceneEnded(scene);
    expect(runtime.entries).toHaveLength(0);
  });

  it('pop() leaves HUDs, modal option, unknown saved themes fall back', async () => {
    const { runtime, game } = installUi();
    runtime.global.open(Hud);
    runtime.global.pop();
    await settle();
    expect(runtime.entries).toHaveLength(1);
    runtime.global.open(Menu, {}, { modal: true, enter: 'none' });
    await settle();
    expect(runtime.entries.at(-1)?.mode).toBe('modal');
    expect(game.input.blocked).toBe(true);
    game.settings.set('ui.theme', 'custom');
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const next = new UiRuntime(game);
    // The saved name is kept for when the theme gets registered; drawing uses BlackLight meanwhile.
    expect(next.theme).toBe('custom');
    expect(resolveTheme().name).toBe('blacklight');
    game.settings.delete('ui.theme');
    warn.mockRestore();
    next.theme = 'blacklight';
  });

  it('named screens load before they show', async () => {
    const { game } = installUi();
    const runtime = new (await import('../src/runtime')).UiRuntime(game, {
      screens: {
        '../ui/Late.vue': () =>
          new Promise((r) =>
            setTimeout(() => r({ default: Hud, [Symbol.toStringTag]: 'Module' }), 20),
          ),
      },
    });
    runtime.global.open('Late');
    expect(runtime.entries).toHaveLength(0);
    await new Promise((r) => setTimeout(r, 40));
    await settle();
    expect(runtime.element.querySelector('.hud')).not.toBeNull();
  });

  it('saves the UI scale and theme', () => {
    const { runtime, game } = installUi();
    runtime.setScale(3);
    expect(runtime.scale.value).toBe(1.5);
    runtime.theme = 'persona';
    expect(game.settings.get('ui.theme')).toBe('persona');
    expect(() => (runtime.theme = 'nope')).toThrow(/Unknown UI theme/);
  });
});

describe('themes', () => {
  it('turn tokens into CSS variables', () => {
    const vars = themeVariables(getTheme('persona'));
    expect(vars['--bl-color-primary']).toBe('#e60012');
    expect(vars['--bl-color-on-primary']).toBe('#ffffff');
    expect(vars['--bl-skew']).toBe('-12deg');
    expect(vars['--bl-shadow-offset']).toBe('8px');
  });
});

describe('prompts', () => {
  it('maps bindings to Kenney glyphs per device family', () => {
    expect(kenneyFile('Pad:A', 'xbox')).toBe('xbox/xbox_button_a');
    expect(kenneyFile('Pad:A', 'playstation')).toBe('playstation/playstation_button_cross');
    expect(kenneyFile('Pad:A', 'switch')).toBe('switch/switch_button_b');
    expect(kenneyFile('KeyE', 'keyboard')).toBe('keyboard/keyboard_e');
    expect(kenneyFile('ArrowLeft', 'keyboard')).toBe('keyboard/keyboard_arrow_left');
    expect(kenneyFile('Mouse:Left', 'mouse')).toBe('keyboard/mouse_left');
    expect(kenneyFile('Touch', 'touch')).toBe('touch/touch_tap');
    expect(glyphFor('Pad:A', 'xbox').src).toBeTruthy();
    expect(glyphFor('NumpadMultiply', 'keyboard')).toEqual({
      src: undefined,
      text: 'NumpadMultiply',
    });
  });

  it('picks the binding of the device in use and the pad family', () => {
    expect(bindingForDevice(['Enter', 'Pad:A'], 'gamepad')).toBe('Pad:A');
    expect(bindingForDevice(['Enter', 'Pad:A'], 'keyboard')).toBe('Enter');
    expect(
      padFamily({ id: 'Wireless Controller (STANDARD GAMEPAD Vendor: 054c Product: 09cc)' }),
    ).toBe('playstation');
    expect(padFamily({ id: '057e-2009-Pro Controller' })).toBe('switch');
    expect(
      padFamily({ id: 'Xbox Wireless Controller (STANDARD GAMEPAD Vendor: 045e Product: 0b13)' }),
    ).toBe('xbox');
    expect(padFamily(undefined)).toBe('xbox');
  });
});

describe('Timeline', () => {
  it('places steps with labels and relative positions', () => {
    const element = document.createElement('div');
    const timeline = new Timeline(undefined)
      .to(element, { opacity: [0, 1] }, { duration: 0.5 })
      .label('items')
      .to(element, { x: [0, 10] }, { at: '+0.1', duration: 0.2 })
      .call(() => {}, 'items+1');
    expect(timeline.labelTime('items')).toBe(0.5);
    expect(timeline.duration).toBeCloseTo(1.5);
    expect(() => timeline.labelTime('nope')).toThrow(/Unknown timeline label/);
  });
});
