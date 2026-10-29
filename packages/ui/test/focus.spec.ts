import { describe, expect, it, vi } from 'vitest';
import { FocusManager, FOCUS_ATTR, GROUP_ATTR } from '../src/focus';
import { place } from './helpers';

function build(html: string) {
  const root = document.createElement('div');
  root.innerHTML = html;
  document.body.append(root);
  root.querySelectorAll<HTMLElement>('[data-at]').forEach((el) => {
    const [x, y] = el.dataset.at!.split(',').map(Number);
    place(el, x!, y!);
  });
  const sounds: string[] = [];
  const focus = new FocusManager(root, { sound: (s) => sounds.push(s) });
  focus.setScope(root.querySelector('[data-bl-screen]')!);
  const $ = (id: string) => root.querySelector<HTMLElement>(`#${id}`)!;
  return { root, focus, sounds, $ };
}

describe('FocusManager', () => {
  it('focuses the autofocus element, moves spatially and plays sounds', () => {
    const { focus, sounds, $ } = build(`
      <div data-bl-screen>
        <button id="a" ${FOCUS_ATTR} data-at="0,0">A</button>
        <button id="b" ${FOCUS_ATTR} data-bl-autofocus data-at="0,50">B</button>
        <button id="c" ${FOCUS_ATTR} data-at="0,100">C</button>
      </div>`);
    expect(focus.current.value).toBe($('b'));
    expect(focus.move('down')).toBe(true);
    expect(focus.current.value).toBe($('c'));
    expect($('c').hasAttribute('data-bl-focused')).toBe(true);
    expect(focus.move('down')).toBe(false);
    expect(sounds).toEqual(['move']);
  });

  it('wraps inside groups, traps and remembers the last focus of a group', () => {
    const { focus, $ } = build(`
      <div data-bl-screen>
        <div ${GROUP_ATTR}="wrap y">
          <button id="a" ${FOCUS_ATTR} data-at="0,0">A</button>
          <button id="b" ${FOCUS_ATTR} data-at="0,50">B</button>
        </div>
        <button id="side" ${FOCUS_ATTR} data-at="300,0">Side</button>
      </div>`);
    focus.focus($('a'));
    focus.move('down');
    focus.move('down');
    expect(focus.current.value).toBe($('a'));
    focus.move('down');
    focus.move('right');
    expect(focus.current.value).toBe($('side'));
    focus.move('left');
    expect(focus.current.value).toBe($('b'));
  });

  it('lets widgets consume directions and confirms with a click', () => {
    const { focus, $, sounds } = build(
      `<div data-bl-screen><div id="s" ${FOCUS_ATTR} data-at="0,0"></div><div id="t" ${FOCUS_ATTR} data-at="200,0"></div></div>`,
    );
    const slider = $('s');
    slider.addEventListener('bl-navigate', (e) => e.preventDefault());
    const click = vi.fn();
    slider.addEventListener('click', click);
    focus.focus(slider);
    expect(focus.move('right')).toBe(true);
    expect(focus.current.value).toBe(slider);
    focus.confirm();
    expect(click).toHaveBeenCalledOnce();
    expect(sounds).toContain('confirm');
  });

  it('ignores disabled and inert elements and follows the pointer', () => {
    const { root, focus, $ } = build(`
      <div data-bl-screen>
        <button id="a" ${FOCUS_ATTR} data-at="0,0">A</button>
        <button id="off" ${FOCUS_ATTR} disabled data-at="0,50">Off</button>
        <div inert><button id="in" ${FOCUS_ATTR} data-at="0,100">Inert</button></div>
        <button id="d" ${FOCUS_ATTR} data-at="0,150">D</button>
      </div>`);
    focus.focus($('a'));
    focus.move('down');
    expect(focus.current.value).toBe($('d'));
    $('a').dispatchEvent(new PointerEvent('pointerover', { bubbles: true }));
    expect(focus.current.value).toBe($('a'));
    expect(root.contains($('in'))).toBe(true);
  });
});
