// Asset browser: thumbnails, unused files, what each scene preloads.
import type { AssetBrowserState } from '../src/panels';
import { connect, formatBytes, h, memory, render, send } from './common';

const ui = memory({ tab: 'assets', unusedOnly: false, filter: '' });
let state: AssetBrowserState | undefined;

const ICONS: Record<string, string> = {
  audio: '♪',
  font: 'Aa',
  video: '▶',
  model: '◆',
  data: '{ }',
  image: '',
};

function assets(): HTMLElement {
  const list = state!.assets.filter(
    (a) =>
      (!ui.unusedOnly || !a.used) &&
      (!ui.filter || a.path.toLowerCase().includes(ui.filter.toLowerCase())),
  );
  return h(
    'div',
    {},
    h(
      'div',
      { class: 'row', style: 'margin-bottom:12px' },
      h('input', {
        placeholder: 'Filter',
        'data-key': 'filter',
        value: ui.filter,
        class: 'grow',
        oninput: (e: Event) => ((ui.filter = (e.target as HTMLInputElement).value), view()),
      }),
      h(
        'label',
        { class: 'row' },
        h('input', {
          type: 'checkbox',
          checked: ui.unusedOnly,
          onchange: (e: Event) => (
            (ui.unusedOnly = (e.target as HTMLInputElement).checked),
            view()
          ),
        }),
        'Unused only',
      ),
    ),
    h(
      'div',
      { class: 'thumbs' },
      list.map((a) =>
        h(
          'div',
          {
            class: 'thumb',
            title: a.used ? `Used by ${a.usedBy}` : 'Not referenced by code or data',
            onclick: () => send('open', { path: a.path }),
          },
          h(
            'div',
            { class: 'thumb__image checker' },
            state!.thumbnails[a.path]
              ? h('img', { src: state!.thumbnails[a.path], alt: '' })
              : h('span', { style: 'font-size:24px' }, ICONS[a.kind] ?? '?'),
          ),
          h('div', { class: 'thumb__name' }, a.path),
          h(
            'div',
            { class: 'row' },
            h('span', { class: 'muted' }, formatBytes(a.bytes)),
            !a.used && h('span', { class: 'badge badge--warn' }, 'unused'),
          ),
        ),
      ),
    ),
  );
}

function scenes(): HTMLElement {
  const max = Math.max(1, ...state!.scenes.map((s) => s.bytes));
  return h(
    'div',
    {},
    state!.scenes.map((scene) =>
      h(
        'div',
        { class: 'card' },
        h(
          'div',
          { class: 'row' },
          h('h3', { class: 'grow' }, scene.scene),
          h('strong', {}, formatBytes(scene.bytes)),
          h('span', { class: 'muted' }, `${scene.files.length} files`),
        ),
        h('div', { class: 'bar', style: `width:${(scene.bytes / max) * 100}%` }),
        h(
          'details',
          {},
          h('summary', { class: 'muted' }, 'Files loaded before the scene starts'),
          h(
            'div',
            { class: 'list' },
            scene.files.map((f) =>
              h(
                'div',
                { class: 'list__item', onclick: () => send('open', { path: f.path }) },
                h('span', { class: 'grow' }, f.path),
                h('span', { class: 'muted' }, f.reason),
                formatBytes(f.bytes),
              ),
            ),
          ),
        ),
      ),
    ),
  );
}

function view(): void {
  if (!state) return;
  const unused = state.assets.filter((a) => !a.used);
  render(
    h(
      'div',
      { class: 'row' },
      h('h1', { class: 'grow' }, 'Assets'),
      h(
        'span',
        { class: 'muted' },
        `${state.assets.length} files · ${formatBytes(state.totalBytes)} · ${unused.length} unused (${formatBytes(unused.reduce((s, a) => s + a.bytes, 0))})`,
      ),
      h('button', { onclick: () => send('refresh') }, 'Refresh'),
    ),
    h(
      'div',
      { class: 'tabs' },
      h(
        'button',
        {
          class: ui.tab === 'assets' ? 'primary' : '',
          onclick: () => ((ui.tab = 'assets'), view()),
        },
        'Files',
      ),
      h(
        'button',
        {
          class: ui.tab === 'scenes' ? 'primary' : '',
          onclick: () => ((ui.tab = 'scenes'), view()),
        },
        'Weight per scene',
      ),
    ),
    ui.tab === 'assets' ? assets() : scenes(),
  );
}

connect<AssetBrowserState>((next) => {
  state = next;
  view();
});
