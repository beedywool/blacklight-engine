// Sprite-sheet slicer: set the frame grid, select frames into named animations, preview them,
// save as `<name>@WxH.png` + `<folder>.anim.json`.
import type { SlicerState } from '../src/editors/slicer';
import { connect, field, h, image, memory, numberInput, render, send } from './common';

const ui = memory({
  zoom: 3,
  fps: 10,
  current: 'idle',
  animations: {} as Record<string, number[]>,
  rename: true,
});
let state: SlicerState | undefined;
let lastClicked: number | undefined;
let previewStep = 0;

function toggle(index: number, range: boolean): void {
  const list = new Set(ui.animations[ui.current] ?? []);
  if (range && lastClicked !== undefined) {
    const [a, b] = [Math.min(lastClicked, index), Math.max(lastClicked, index)];
    for (let i = a; i <= b; i++) list.add(i);
  } else if (list.has(index)) list.delete(index);
  else list.add(index);
  lastClicked = index;
  ui.animations = { ...ui.animations, [ui.current]: [...list].sort((x, y) => x - y) };
  view();
}

function sheet(): HTMLElement {
  if (!state) return h('div');
  const canvas = h('canvas', { class: 'checker', style: 'cursor:crosshair' });
  canvas.width = state.width * ui.zoom;
  canvas.height = state.height * ui.zoom;
  const selected = new Set(ui.animations[ui.current] ?? []);
  const paint = () => {
    const ctx = canvas.getContext('2d')!;
    ctx.imageSmoothingEnabled = false;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(image(state!.imageUrl), 0, 0, canvas.width, canvas.height);
    ctx.font = '11px system-ui';
    state!.slice.frames.forEach((f, i) => {
      const [x, y, w, hgt] = [f.x * ui.zoom, f.y * ui.zoom, f.width * ui.zoom, f.height * ui.zoom];
      ctx.strokeStyle = selected.has(i) ? '#ffffff' : 'rgba(255,255,255,0.35)';
      ctx.lineWidth = selected.has(i) ? 2 : 1;
      ctx.strokeRect(x + 0.5, y + 0.5, w - 1, hgt - 1);
      if (selected.has(i)) {
        ctx.fillStyle = 'rgba(255,255,255,0.15)';
        ctx.fillRect(x, y, w, hgt);
      }
      ctx.fillStyle = '#fff';
      ctx.fillText(String(i), x + 3, y + 12);
    });
  };
  image(state.imageUrl, paint);
  canvas.addEventListener('click', (event) => {
    const rect = canvas.getBoundingClientRect();
    const x = (event.clientX - rect.left) / ui.zoom;
    const y = (event.clientY - rect.top) / ui.zoom;
    const index = state!.slice.frames.findIndex(
      (f) => x >= f.x && x < f.x + f.width && y >= f.y && y < f.y + f.height,
    );
    if (index >= 0) toggle(index, event.shiftKey);
  });
  return canvas;
}

function animate(): void {
  const canvas = document.getElementById('preview') as HTMLCanvasElement | null;
  const frames = ui.animations[ui.current] ?? [];
  if (canvas && state?.slice && frames.length) {
    const frame = state.slice.frames[frames[previewStep % frames.length]!];
    if (frame) {
      const scale = Math.max(1, Math.floor(96 / Math.max(frame.width, frame.height)));
      canvas.width = frame.width * scale;
      canvas.height = frame.height * scale;
      const ctx = canvas.getContext('2d')!;
      ctx.imageSmoothingEnabled = false;
      ctx.drawImage(
        image(state.imageUrl),
        frame.x,
        frame.y,
        frame.width,
        frame.height,
        0,
        0,
        canvas.width,
        canvas.height,
      );
    }
  }
  previewStep++;
  setTimeout(animate, 1000 / Math.max(1, ui.fps));
}

function view(): void {
  if (!state) return;
  const spec = state.slice.spec;
  const grid = (key: 'width' | 'height' | 'spacing', value: number | undefined) =>
    send('grid', { ...spec, [key]: value ?? 0 });
  render(
    h('h1', {}, state.file),
    h(
      'p',
      { class: 'muted' },
      `${state.width} × ${state.height} px · ${state.slice.frames.length} frames (${state.slice.columns} × ${state.slice.rows})`,
    ),
    h(
      'div',
      { class: 'layout' },
      h(
        'div',
        {},
        h(
          'div',
          { class: 'card' },
          h('h2', {}, 'Grid'),
          field(
            'Frame width',
            numberInput('width', spec.width, (v) => grid('width', v), { min: 1 }),
          ),
          field(
            'Frame height',
            numberInput('height', spec.height, (v) => grid('height', v), { min: 1 }),
          ),
          field(
            'Spacing',
            numberInput('spacing', spec.spacing, (v) => grid('spacing', v), { min: 0 }),
            'Margin and gap between frames, in pixels',
          ),
          field(
            'Zoom',
            numberInput('zoom', ui.zoom, (v) => ((ui.zoom = Math.max(1, v ?? 1)), view()), {
              min: 1,
              max: 12,
            }),
          ),
        ),
        h(
          'div',
          { class: 'card' },
          h('h2', {}, 'Animations'),
          h(
            'p',
            { class: 'muted' },
            'Click frames to add them to the selected animation; Shift-click adds a range.',
          ),
          h(
            'div',
            { class: 'list' },
            Object.entries(ui.animations).map(([name, frames]) =>
              h(
                'div',
                {
                  class: `list__item${name === ui.current ? ' selected' : ''}`,
                  onclick: () => ((ui.current = name), view()),
                },
                h('span', { class: 'grow' }, name),
                h('span', { class: 'muted' }, frames.join(', ') || 'no frames'),
                h(
                  'button',
                  {
                    class: 'small danger',
                    onclick: (e: Event) => {
                      e.stopPropagation();
                      ui.animations = Object.fromEntries(
                        Object.entries(ui.animations).filter(([n]) => n !== name),
                      );
                      view();
                    },
                  },
                  '×',
                ),
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
                const name = input.value.trim();
                if (!name) return;
                ui.animations = { ...ui.animations, [name]: ui.animations[name] ?? [] };
                ui.current = name;
                view();
              },
            },
            h('input', { name: 'name', placeholder: 'idle, run, jump…', class: 'grow' }),
            h('button', { type: 'submit' }, 'Add'),
          ),
          field(
            'FPS',
            numberInput('fps', ui.fps, (v) => (ui.fps = Math.max(1, v ?? 10)), { min: 1 }),
          ),
          h(
            'div',
            { class: 'checker', style: 'display:inline-block;border-radius:8px;margin-top:8px' },
            h('canvas', { id: 'preview' }),
          ),
        ),
        h(
          'div',
          { class: 'card' },
          h(
            'label',
            { class: 'row' },
            h('input', {
              type: 'checkbox',
              checked: ui.rename,
              onchange: (e: Event) => (ui.rename = (e.target as HTMLInputElement).checked),
            }),
            `Rename the image to ${state.gridName}`,
          ),
          h(
            'p',
            { class: 'muted' },
            state.animFile
              ? `Saving replaces the animations of ${state.animFile}.`
              : 'Saving writes the .anim.json of this folder.',
          ),
          h(
            'button',
            {
              class: 'primary',
              onclick: () =>
                send('save', { animations: ui.animations, fps: ui.fps, rename: ui.rename }),
            },
            'Save',
          ),
        ),
      ),
      h('div', { class: 'card', style: 'overflow:auto' }, sheet()),
    ),
  );
}

connect<SlicerState>((next) => {
  state = next;
  view();
});
animate();
