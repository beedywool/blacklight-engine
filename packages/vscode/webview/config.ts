// `game.config.ts` form: each change edits only that value in the TypeScript file.
import type { ConfigField } from '../src/core/config';
import type { ConfigFormState } from '../src/panels';
import { connect, field, h, numberInput, render, send, textInput } from './common';

let state: ConfigFormState | undefined;

const set = (path: string, value: unknown) => send('set', { path, value });

function control(f: ConfigField): Node {
  const value = state!.values[f.path];
  if (state!.computed.includes(f.path))
    return h('span', { class: 'muted' }, 'computed in code: edit game.config.ts');
  switch (f.type) {
    case 'number':
      return numberInput(f.path, value as number | undefined, (v) => set(f.path, v));
    case 'boolean':
      return h(
        'select',
        {
          'data-key': f.path,
          onchange: (e: Event) => {
            const v = (e.target as HTMLSelectElement).value;
            set(f.path, v === '' ? undefined : v === 'true');
          },
        },
        h('option', { value: '' }, 'default'),
        h('option', { value: 'true', selected: value === true }, 'yes'),
        h('option', { value: 'false', selected: value === false }, 'no'),
      );
    case 'enum':
    case 'scene': {
      const options = f.type === 'scene' ? state!.scenes : (f.options ?? []);
      return h(
        'select',
        {
          'data-key': f.path,
          onchange: (e: Event) => set(f.path, (e.target as HTMLSelectElement).value || undefined),
        },
        !f.required && h('option', { value: '' }, 'default'),
        value !== undefined &&
          !options.includes(String(value)) &&
          h('option', { value: String(value), selected: true }, `${String(value)} (missing)`),
        options.map((o) => h('option', { value: o, selected: value === o }, o)),
      );
    }
    case 'actions':
      return actions((value as Record<string, string[]>) ?? {});
    default:
      return textInput(f.path, value as string | undefined, (v) =>
        set(f.path, v === '' ? undefined : v),
      );
  }
}

function actions(map: Record<string, string[]>): HTMLElement {
  const write = (next: Record<string, string[]>) => set('input.actions', next);
  return h(
    'div',
    { class: 'list' },
    Object.entries(map).map(([name, bindings]) =>
      h(
        'div',
        { class: 'row' },
        h('code', { style: 'min-width:90px' }, name),
        textInput(
          `action.${name}`,
          bindings.join(', '),
          (v) =>
            write({
              ...map,
              [name]: v
                .split(',')
                .map((b) => b.trim())
                .filter(Boolean),
            }),
          { class: 'grow' },
        ),
        h(
          'button',
          {
            class: 'small danger',
            onclick: () =>
              write(Object.fromEntries(Object.entries(map).filter(([n]) => n !== name))),
          },
          '×',
        ),
      ),
    ),
    h(
      'form',
      {
        class: 'row',
        onsubmit: (e: Event) => {
          e.preventDefault();
          const form = e.target as HTMLFormElement;
          const name = (form.elements.namedItem('name') as HTMLInputElement).value.trim();
          const keys = (form.elements.namedItem('keys') as HTMLInputElement).value;
          if (name)
            write({
              ...map,
              [name]: keys
                .split(',')
                .map((b) => b.trim())
                .filter(Boolean),
            });
        },
      },
      h('input', { name: 'name', placeholder: 'action (fire)' }),
      h('input', { name: 'keys', placeholder: 'KeyF, Mouse:Left, Pad:RT', class: 'grow' }),
      h('button', { type: 'submit' }, 'Add'),
    ),
  );
}

const GROUPS: [string, (path: string) => boolean][] = [
  ['Game', (p) => ['name', 'id', 'version', 'entry'].includes(p)],
  ['Screen', (p) => p.startsWith('resolution.')],
  ['Loop', (p) => ['tickRate', 'pauseOnBlur', 'seed'].includes(p)],
  ['Interface', (p) => p.startsWith('ui.')],
  ['Input', (p) => p.startsWith('input.')],
];

function view(): void {
  if (!state) return;
  render(
    h('h1', {}, state.file),
    state.error && h('p', { class: 'error' }, state.error),
    !state.error &&
      GROUPS.map(([title, test]) =>
        h(
          'div',
          { class: 'card' },
          h('h2', {}, title),
          state!.fields
            .filter((f) => test(f.path))
            .map((f) => field(f.label, control(f), f.description)),
        ),
      ),
    h(
      'p',
      { class: 'muted' },
      'Changes are written to game.config.ts and saved; the dev server restarts the game.',
    ),
  );
}

connect<ConfigFormState>((next) => {
  state = next;
  view();
});
