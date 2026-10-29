// `.anim.json` editor: form on the left, live preview on the right. Every change rewrites the
// JSON document; the preview follows the document (also when it is edited as text).
import type { AnimationState } from '../src/editors/animation';
import { connect, field, h, image, memory, numberInput, render, send, textInput } from './common';

const ui = memory({ selected: '', scale: 4, playing: true });
let state: AnimationState | undefined;
let frameIndex = 0;
let elapsed = 0;
let last = performance.now();

/** `0-3` → range, `0, 2, 5` → list, anything else → Aseprite tag name. */
export function parseFrames(text: string): unknown {
  const trimmed = text.trim();
  if (!trimmed) return undefined;
  const range = /^(\d+)\s*-\s*(\d+)$/.exec(trimmed);
  if (range) return { from: Number(range[1]), to: Number(range[2]) };
  if (/^\d+(\s*,\s*\d+)*$/.test(trimmed)) return trimmed.split(',').map((n) => Number(n.trim()));
  return trimmed;
}

/** Inverse of {@link parseFrames} for the input field. */
export function printFrames(frames: unknown): string {
  if (frames === undefined) return '';
  if (Array.isArray(frames)) return frames.join(', ');
  if (frames && typeof frames === 'object') {
    const range = frames as { from: number; to: number };
    return `${range.from}-${range.to}`;
  }
  return String(frames);
}

function current() {
  const list = state?.preview?.animations ?? [];
  return list.find((a) => a.name === ui.selected) ?? list[0];
}

function draw(): void {
  const canvas = document.getElementById('preview') as HTMLCanvasElement | null;
  const animation = current();
  if (!canvas || !animation || !state?.imageUrl) return;
  const frame = animation.frames[frameIndex % Math.max(1, animation.frames.length)];
  if (!frame) return;
  const img = image(state.imageUrl);
  canvas.width = frame.width * ui.scale;
  canvas.height = frame.height * ui.scale;
  const ctx = canvas.getContext('2d')!;
  ctx.imageSmoothingEnabled = false;
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  if (img.complete)
    ctx.drawImage(
      img,
      frame.x,
      frame.y,
      frame.width,
      frame.height,
      0,
      0,
      canvas.width,
      canvas.height,
    );
  const label = document.getElementById('frame-label');
  const events = animation.events[frameIndex];
  if (label)
    label.textContent = `frame ${frameIndex + 1}/${animation.frames.length}${events ? ` · ${events.join(', ')}` : ''}`;
}

function tick(now: number): void {
  const animation = current();
  if (animation && ui.playing && animation.frames.length > 0) {
    elapsed += now - last;
    const duration = animation.durations[frameIndex] ?? 100;
    if (elapsed >= duration) {
      elapsed -= duration;
      if (frameIndex + 1 < animation.frames.length) frameIndex++;
      else if (animation.loop) frameIndex = 0;
      else if (animation.next) {
        ui.selected = animation.next;
        frameIndex = 0;
        view();
      }
    }
  }
  last = now;
  draw();
  requestAnimationFrame(tick);
}

function strip(): HTMLElement {
  const animation = current();
  if (!animation || !state?.imageUrl) return h('div');
  const img = image(state.imageUrl);
  return h(
    'div',
    { class: 'row' },
    animation.frames.map((frame, i) => {
      const canvas = h('canvas', {
        class: `checker${i === frameIndex ? ' selected' : ''}`,
        title: `step ${i}`,
      });
      const scale = Math.max(1, Math.floor(48 / Math.max(frame.width, frame.height)));
      canvas.width = frame.width * scale;
      canvas.height = frame.height * scale;
      const paint = () => {
        const ctx = canvas.getContext('2d')!;
        ctx.imageSmoothingEnabled = false;
        ctx.drawImage(
          img,
          frame.x,
          frame.y,
          frame.width,
          frame.height,
          0,
          0,
          canvas.width,
          canvas.height,
        );
      };
      image(state!.imageUrl!, paint);
      canvas.addEventListener('click', () => {
        ui.playing = false;
        frameIndex = i;
        view();
      });
      return canvas;
    }),
  );
}

function animationForm(name: string, def: Record<string, unknown>): HTMLElement {
  const set = (key: string, value: unknown) => send('set', { animation: name, key, value });
  const names = Object.keys((state?.json?.animations as object) ?? {});
  return h(
    'div',
    { class: 'card' },
    h(
      'div',
      { class: 'row' },
      h('h3', { class: 'grow' }, name),
      h('button', { class: 'small danger', onclick: () => send('remove', { name }) }, 'Remove'),
    ),
    field(
      'Name',
      textInput(
        `${name}.name`,
        name,
        (to) => to && to !== name && send('rename', { from: name, to }),
      ),
    ),
    field(
      'Frames',
      textInput(`${name}.frames`, printFrames(def.frames), (text) =>
        set('frames', parseFrames(text)),
      ),
      '0-3, a list (0, 2, 4) or an Aseprite tag',
    ),
    field(
      'FPS',
      numberInput(`${name}.fps`, def.fps as number | undefined, (v) => set('fps', v), { min: 1 }),
    ),
    field(
      'Loop',
      h('input', {
        type: 'checkbox',
        checked: def.loop !== false && !def.next,
        onchange: (e: Event) =>
          set('loop', (e.target as HTMLInputElement).checked ? undefined : false),
      }),
    ),
    field(
      'Ping-pong',
      h('input', {
        type: 'checkbox',
        checked: !!def.pingPong,
        onchange: (e: Event) =>
          set('pingPong', (e.target as HTMLInputElement).checked || undefined),
      }),
    ),
    field(
      'Reverse',
      h('input', {
        type: 'checkbox',
        checked: !!def.reverse,
        onchange: (e: Event) => set('reverse', (e.target as HTMLInputElement).checked || undefined),
      }),
    ),
    field(
      'Then play',
      h(
        'select',
        {
          'data-key': `${name}.next`,
          onchange: (e: Event) => set('next', (e.target as HTMLSelectElement).value || undefined),
        },
        h('option', { value: '' }, '—'),
        names
          .filter((n) => n !== name)
          .map((n) => h('option', { value: n, selected: def.next === n }, n)),
      ),
    ),
    field(
      'Events',
      textInput(
        `${name}.events`,
        Object.entries((def.events as Record<string, string | string[]>) ?? {})
          .map(([frame, event]) => `${frame}:${[event].flat().join('|')}`)
          .join(', '),
        (text) => {
          const events: Record<string, string | string[]> = {};
          for (const part of text
            .split(',')
            .map((p) => p.trim())
            .filter(Boolean)) {
            const [frame, list] = part.split(':');
            const names = (list ?? '')
              .split('|')
              .map((n) => n.trim())
              .filter(Boolean);
            if (frame && names.length)
              events[frame.trim()] = names.length === 1 ? names[0]! : names;
          }
          set('events', Object.keys(events).length ? events : undefined);
        },
      ),
      'step:event, e.g. 1:step, 3:step|dust',
    ),
  );
}

function view(): void {
  if (!state) return;
  const json = state.json;
  const animations = (json?.animations as Record<string, Record<string, unknown>>) ?? {};
  if (!ui.selected || !animations[ui.selected])
    ui.selected = state.preview.default ?? Object.keys(animations)[0] ?? '';
  const selected = ui.selected;
  render(
    h('h1', {}, state.file),
    state.preview.error && h('p', { class: 'error' }, state.preview.error),
    !json && h('p', { class: 'error' }, 'The file is not valid JSON; fix it in the text editor.'),
    h(
      'div',
      { class: 'layout' },
      h(
        'div',
        {},
        json &&
          h(
            'div',
            { class: 'card' },
            h('h2', {}, 'File'),
            field(
              'Source',
              textInput('source', json.source as string, (v) =>
                send('set', { key: 'source', value: v || undefined }),
              ),
              'Sheet image or Aseprite JSON, relative to this folder',
            ),
            field(
              'Default FPS',
              numberInput('fps', json.fps as number | undefined, (v) =>
                send('set', { key: 'fps', value: v }),
              ),
            ),
            field(
              'Default',
              h(
                'select',
                {
                  'data-key': 'default',
                  onchange: (e: Event) =>
                    send('set', {
                      key: 'default',
                      value: (e.target as HTMLSelectElement).value || undefined,
                    }),
                },
                Object.keys(animations).map((n) =>
                  h(
                    'option',
                    { value: n, selected: (json.default ?? Object.keys(animations)[0]) === n },
                    n,
                  ),
                ),
              ),
            ),
          ),
        h(
          'div',
          { class: 'card' },
          h('h2', {}, 'Animations'),
          h(
            'div',
            { class: 'list' },
            Object.keys(animations).map((name) =>
              h(
                'div',
                {
                  class: `list__item${name === selected ? ' selected' : ''}`,
                  onclick: () => (
                    (ui.selected = name),
                    (frameIndex = 0),
                    (ui.playing = true),
                    view()
                  ),
                },
                name,
              ),
            ),
          ),
          h(
            'form',
            {
              class: 'row',
              style: 'margin-top:8px',
              onsubmit: (e: Event) => {
                e.preventDefault();
                const input = (e.target as HTMLFormElement).elements.namedItem(
                  'name',
                ) as HTMLInputElement;
                if (input.value.trim()) send('add', { name: input.value.trim() });
                ui.selected = input.value.trim();
              },
            },
            h('input', { name: 'name', placeholder: 'new animation', class: 'grow' }),
            h('button', { type: 'submit' }, 'Add'),
          ),
        ),
        animations[selected] && animationForm(selected, animations[selected]),
      ),
      h(
        'div',
        { class: 'card' },
        h('h2', {}, `Preview · ${selected}`),
        h(
          'div',
          { class: 'checker', style: 'display:inline-block;border-radius:8px' },
          h('canvas', { id: 'preview' }),
        ),
        h('p', { id: 'frame-label', class: 'muted' }),
        h(
          'div',
          { class: 'row' },
          h(
            'button',
            { class: 'primary', onclick: () => ((ui.playing = !ui.playing), view()) },
            ui.playing ? 'Pause' : 'Play',
          ),
          h(
            'button',
            { onclick: () => ((frameIndex = 0), (elapsed = 0), (ui.playing = true)) },
            'Restart',
          ),
          field(
            'Zoom',
            numberInput('zoom', ui.scale, (v) => ((ui.scale = Math.max(1, v ?? 1)), view()), {
              min: 1,
              max: 16,
            }),
          ),
          h('button', { onclick: () => send('source') }, 'Show JSON'),
        ),
        h('h2', { style: 'margin-top:12px' }, 'Frames'),
        strip(),
      ),
    ),
  );
  draw();
}

connect<AnimationState>((next) => {
  state = next;
  if (state.imageUrl) image(state.imageUrl, draw);
  view();
});
requestAnimationFrame(tick);
