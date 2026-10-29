// Live UI preview: the running game in a frame with the screen opened over it, and the screen's
// focus states (each focusable element focused in turn) to check how every state looks.
import type { UiPreviewState } from '../src/panels';
import { connect, h, memory, render, send } from './common';

const ui = memory({ cycle: false, width: 960 });
let state: UiPreviewState | undefined;
let frame: HTMLIFrameElement | undefined;
let timer: ReturnType<typeof setInterval> | undefined;

function cycle(on: boolean): void {
  ui.cycle = on;
  clearInterval(timer);
  if (!on) return;
  timer = setInterval(() => {
    const items = state?.focusables ?? [];
    if (!items.length) return;
    const current = items.findIndex((f) => f.focused);
    send('focus', { index: (current + 1) % items.length });
  }, 1200);
}

function view(): void {
  if (!state) return;
  // Keep the frame between renders: recreating it would restart the game.
  if (state.url && frame?.dataset.url !== state.url) {
    frame = h('iframe', {
      src: state.url,
      'data-url': state.url,
      title: `Preview of ${state.screen}`,
    });
  }
  render(
    h(
      'div',
      { class: 'row' },
      h('h1', { class: 'grow' }, `Preview · ${state.screen}`),
      h('span', { class: 'muted' }, state.file),
    ),
    state.error && h('p', { class: 'error' }, state.error),
    !state.url &&
      h(
        'p',
        { class: 'muted' },
        'Run `blacklight dev` in the game folder, then reopen this preview.',
      ),
    state.url &&
      h(
        'div',
        { class: 'layout', style: 'grid-template-columns: 1fr 260px' },
        h(
          'div',
          { style: `max-width:${ui.width}px` },
          frame,
          h(
            'p',
            { class: 'muted' },
            state.ready
              ? 'Saving the .vue file updates the preview (Vue hot reload).'
              : 'Waiting for the game in the frame…',
          ),
        ),
        h(
          'div',
          { class: 'card' },
          h('h2', {}, 'Focus states'),
          state.focusables.length === 0 &&
            h(
              'p',
              { class: 'muted' },
              state.ready ? 'No focusable element on the top screen.' : '—',
            ),
          h(
            'div',
            { class: 'list' },
            state.focusables.map((f) =>
              h(
                'div',
                {
                  class: `list__item${f.focused ? ' selected' : ''}`,
                  onclick: () => send('focus', { index: f.index }),
                },
                h('span', { class: 'badge' }, String(f.index)),
                f.label,
              ),
            ),
          ),
          h(
            'div',
            { class: 'row', style: 'margin-top:8px' },
            h(
              'button',
              { class: ui.cycle ? 'primary' : '', onclick: () => (cycle(!ui.cycle), view()) },
              ui.cycle ? 'Stop cycling' : 'Cycle states',
            ),
            h('button', { onclick: () => send('refresh') }, 'Refresh'),
            h('button', { onclick: () => send('reopen') }, 'Reopen screen'),
          ),
        ),
      ),
  );
}

connect<UiPreviewState>((next) => {
  state = next;
  view();
});
if (ui.cycle) cycle(true);
