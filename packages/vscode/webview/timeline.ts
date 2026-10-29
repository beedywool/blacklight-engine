// UI timeline editor: one row per step on a time ruler; drag a bar to move it (sets `at`), drag
// its right edge to change the duration; the form edits the step.
import type { TimelineStep } from '../src/core/timeline';
import type { TimelineState } from '../src/editors/timeline';
import { connect, field, h, memory, numberInput, render, send, textInput } from './common';

const ui = memory({ selected: 0, pxPerSecond: 400 });
let state: TimelineState | undefined;

const update = (index: number, step: TimelineStep) =>
  send('edit', { edit: { op: 'update', index, step } });
const round = (n: number) => Math.round(n * 100) / 100;

function ruler(duration: number): HTMLElement {
  const marks: HTMLElement[] = [];
  for (let t = 0; t <= duration + 0.0001; t += 0.1)
    marks.push(
      h(
        'span',
        { style: `position:absolute;left:${t * ui.pxPerSecond}px` },
        // A label every 0.1 s when there is room, else every 0.5 s.
        ui.pxPerSecond >= 300 || Math.round(t * 10) % 5 === 0 ? `${round(t)}s` : '·',
      ),
    );
  return h('div', { class: 'timeline-ruler' }, marks);
}

function bar(index: number): HTMLElement {
  const row = state!.rows[index]!;
  const step = state!.timeline!.steps[index]!;
  const marker = row.duration === 0;
  const element = h('div', {
    class: `timeline-bar${marker ? ' timeline-bar--marker' : ''}${index === ui.selected ? ' selected' : ''}`,
    style: `left:${row.start * ui.pxPerSecond}px;width:${Math.max(3, row.duration * ui.pxPerSecond)}px`,
    title: `${round(row.start)}s → ${round(row.start + row.duration)}s`,
  });
  element.addEventListener('mousedown', (event) => {
    ui.selected = index;
    const startX = event.clientX;
    const rect = element.getBoundingClientRect();
    const resizing = !marker && event.clientX > rect.right - 6;
    const move = (e: MouseEvent) => {
      const dt = (e.clientX - startX) / ui.pxPerSecond;
      if (resizing) element.style.width = `${Math.max(3, (row.duration + dt) * ui.pxPerSecond)}px`;
      else element.style.left = `${Math.max(0, row.start + dt) * ui.pxPerSecond}px`;
    };
    const up = (e: MouseEvent) => {
      window.removeEventListener('mousemove', move);
      window.removeEventListener('mouseup', up);
      const dt = (e.clientX - startX) / ui.pxPerSecond;
      if (Math.abs(e.clientX - startX) < 2) return view();
      if (resizing && 'to' in step)
        update(index, { ...step, duration: Math.max(0, round(row.duration + dt)) });
      else update(index, { ...step, at: Math.max(0, round(row.start + dt)) });
    };
    window.addEventListener('mousemove', move);
    window.addEventListener('mouseup', up);
  });
  return element;
}

/** `"at"` from the form: a number when it is one, else the text (`<`, `+0.1`, `label+0.2`). */
export function parseAt(text: string): number | string | undefined {
  const trimmed = text.trim();
  if (!trimmed) return undefined;
  return /^\d*\.?\d+$/.test(trimmed) ? Number(trimmed) : trimmed;
}

function form(): HTMLElement {
  const index = ui.selected;
  const step = state?.timeline?.steps[index];
  if (!step) return h('div', { class: 'card' }, h('p', { class: 'muted' }, 'Select a step.'));
  const at = field(
    'Starts at',
    textInput('at', step.at === undefined ? '' : String(step.at), (v) =>
      update(index, { ...step, at: parseAt(v) }),
    ),
    'seconds, <, +0.1, a label or label+0.2; empty: after the previous step',
  );
  const controls = h(
    'div',
    { class: 'row' },
    h(
      'button',
      { onclick: () => send('edit', { edit: { op: 'move', index, to: index - 1 } }) },
      'Up',
    ),
    h(
      'button',
      { onclick: () => send('edit', { edit: { op: 'move', index, to: index + 1 } }) },
      'Down',
    ),
    h(
      'button',
      {
        class: 'danger',
        onclick: () => (
          (ui.selected = Math.max(0, index - 1)),
          send('edit', { edit: { op: 'remove', index } })
        ),
      },
      'Delete',
    ),
  );
  if ('to' in step) {
    return h(
      'div',
      { class: 'card' },
      h('h2', {}, `Animation · step ${index}`),
      field(
        'Elements',
        textInput('to', step.to, (v) => update(index, { ...step, to: v })),
        'CSS selector inside the screen',
      ),
      field(
        'Keyframes',
        h(
          'textarea',
          {
            'data-key': 'keyframes',
            onchange: (e: Event) => {
              try {
                update(index, {
                  ...step,
                  keyframes: JSON.parse((e.target as HTMLTextAreaElement).value) as Record<
                    string,
                    unknown
                  >,
                });
              } catch {
                (e.target as HTMLTextAreaElement).classList.add('error');
              }
            },
          },
          JSON.stringify(step.keyframes),
        ),
        'JSON: { "x": [-40, 0], "opacity": [0, 1] }',
      ),
      at,
      field(
        'Duration',
        numberInput(
          'duration',
          step.duration ?? 0.3,
          (v) => update(index, { ...step, duration: v }),
          { step: 0.05, min: 0 },
        ),
        'seconds',
      ),
      field(
        'Easing',
        textInput(
          'ease',
          Array.isArray(step.ease) ? step.ease.join(', ') : (step.ease ?? ''),
          (v) => {
            const numbers = v.split(',').map((n) => Number(n.trim()));
            update(index, {
              ...step,
              ease:
                v.trim() === ''
                  ? undefined
                  : numbers.length === 4 && numbers.every((n) => !Number.isNaN(n))
                    ? numbers
                    : v.trim(),
            });
          },
        ),
        'easeOut, backOut, or a cubic bezier: 0.05, 0.7, 0.1, 1',
      ),
      controls,
    );
  }
  if ('label' in step)
    return h(
      'div',
      { class: 'card' },
      h('h2', {}, `Label · step ${index}`),
      field(
        'Name',
        textInput('label', step.label, (v) => update(index, { ...step, label: v })),
      ),
      at,
      controls,
    );
  return h(
    'div',
    { class: 'card' },
    h('h2', {}, `Sound · step ${index}`),
    field(
      'Sound',
      textInput('sound', step.sound, (v) => update(index, { ...step, sound: v })),
      'asset key of a UI sound',
    ),
    at,
    controls,
  );
}

function view(): void {
  if (!state) return;
  if (state.error || !state.timeline) {
    render(
      h('h1', {}, state.file),
      h('p', { class: 'error' }, `${state.error ?? 'Invalid file.'} Fix it in the text editor.`),
    );
    return;
  }
  const width = Math.max(1, state.duration + 0.3) * ui.pxPerSecond;
  render(
    h(
      'div',
      { class: 'row' },
      h('h1', { class: 'grow' }, state.file),
      h('span', { class: 'muted' }, `${round(state.duration)} s`),
      h(
        'button',
        {
          class: 'primary',
          disabled: !state.live,
          title: state.live
            ? 'Plays over the screens open in the running game'
            : 'Start the game with blacklight dev',
          onclick: () => send('play'),
        },
        'Play in game',
      ),
    ),
    h(
      'div',
      { class: 'row', style: 'margin:8px 0' },
      h(
        'button',
        {
          onclick: () =>
            send('edit', {
              edit: {
                op: 'add',
                step: { to: '.title', keyframes: { opacity: [0, 1] }, duration: 0.3 },
              },
            }),
        },
        '+ Animation',
      ),
      h(
        'button',
        {
          onclick: () =>
            send('edit', { edit: { op: 'add', step: { label: `label-${state!.rows.length}` } } }),
        },
        '+ Label',
      ),
      h(
        'button',
        {
          onclick: () => send('edit', { edit: { op: 'add', step: { sound: 'ui-move', at: '<' } } }),
        },
        '+ Sound',
      ),
      field(
        'Zoom',
        numberInput(
          'zoom',
          ui.pxPerSecond,
          (v) => ((ui.pxPerSecond = Math.max(50, v ?? 400)), view()),
          { step: 50 },
        ),
        'px per second',
      ),
    ),
    h(
      'div',
      { class: 'card', style: 'overflow:auto' },
      h(
        'div',
        { class: 'timeline-row' },
        h('span'),
        h('div', { style: `width:${width}px` }, ruler(state.duration)),
      ),
      state.rows.map((row, i) =>
        h(
          'div',
          { class: 'timeline-row', onclick: () => ((ui.selected = i), view()) },
          h(
            'div',
            { class: `list__item${i === ui.selected ? ' selected' : ''}` },
            h('span', { class: 'badge' }, row.kind),
            h('span', {}, row.title),
            row.error && h('span', { class: 'error', title: row.error }, '!'),
          ),
          h('div', { class: 'timeline-track', style: `width:${width}px` }, bar(i)),
        ),
      ),
    ),
    form(),
  );
}

connect<TimelineState>((next) => {
  state = next;
  view();
});
