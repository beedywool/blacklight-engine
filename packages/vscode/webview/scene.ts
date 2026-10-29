// Visual scene editor: palette of the scene's objects, the world on a canvas, an inspector.
// Placement is saved in `<scene>.layout.json`; the scene spawns it with `this.load(layout)`.
import type { SceneEditorState } from '../src/editors/scene';
import type { LayoutEdit, Placement } from '../src/core/layout';
import { connect, field, h, image, memory, numberInput, render, send, textInput } from './common';

const ui = memory({ selected: -1, tool: '', snap: 8, zoom: 0 });
let state: SceneEditorState | undefined;
let drag: { index: number; dx: number; dy: number; x: number; y: number } | undefined;

const edit = (change: LayoutEdit) => send('edit', { edit: change });

function scale(): number {
  if (!state) return 1;
  if (ui.zoom > 0) return ui.zoom;
  const width = Math.max(320, (document.getElementById('app')?.clientWidth ?? 900) - 520);
  return Math.min(4, width / state.world.width);
}

function snap(value: number): number {
  return ui.snap > 1 ? Math.round(value / ui.snap) * ui.snap : Math.round(value);
}

function sizeOf(type: string): { width: number; height: number } {
  const entry = state?.palette.find((p) => p.name === type);
  if (entry?.frame) return entry.frame;
  const img = entry?.imageUrl ? image(entry.imageUrl) : undefined;
  return img?.naturalWidth
    ? { width: img.naturalWidth, height: img.naturalHeight }
    : { width: 16, height: 16 };
}

function drawWorld(canvas: HTMLCanvasElement): void {
  if (!state?.layout) return;
  const s = scale();
  canvas.width = Math.round(state.world.width * s);
  canvas.height = Math.round(state.world.height * s);
  const ctx = canvas.getContext('2d')!;
  ctx.imageSmoothingEnabled = false;
  ctx.fillStyle = '#101010';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  // Design area (the camera's first view) over the world.
  ctx.strokeStyle = '#3a3a3a';
  ctx.strokeRect(0.5, 0.5, state.resolution.width * s - 1, state.resolution.height * s - 1);
  const layerOrder = (p: Placement) =>
    state!.layers.indexOf(p.layer ?? (state!.layers.includes('main') ? 'main' : state!.layers[0]!));
  const order = state.layout.objects
    .map((p, i) => ({ p: drag?.index === i ? { ...p, x: drag.x, y: drag.y } : p, i }))
    .sort((a, b) => layerOrder(a.p) - layerOrder(b.p));
  for (const { p, i } of order) {
    const entry = state.palette.find((e) => e.name === p.type);
    const { width, height } = sizeOf(p.type);
    const sx = typeof p.scale === 'number' ? p.scale : (p.scale?.x ?? 1);
    const sy = typeof p.scale === 'number' ? p.scale : (p.scale?.y ?? 1);
    ctx.save();
    ctx.translate(p.x * s, p.y * s);
    ctx.rotate(((p.angle ?? 0) * Math.PI) / 180);
    ctx.scale(sx * s, sy * s);
    const img = entry?.imageUrl ? image(entry.imageUrl) : undefined;
    // Redraw once the image arrives (it is drawn as a grey box until then).
    if (img && !img.complete) img.addEventListener('load', () => drawWorld(canvas), { once: true });
    if (img?.complete && img.naturalWidth) {
      const f = entry!.frame ?? { x: 0, y: 0, width: img.naturalWidth, height: img.naturalHeight };
      ctx.drawImage(img, f.x, f.y, f.width, f.height, -width / 2, -height / 2, width, height);
    } else {
      ctx.fillStyle = entry ? '#5a5a5a' : '#5a2a2a';
      ctx.fillRect(-width / 2, -height / 2, width, height);
    }
    ctx.restore();
    if (i === ui.selected) {
      ctx.strokeStyle = '#fff';
      ctx.lineWidth = 2;
      ctx.strokeRect(
        (p.x - (width * sx) / 2) * s - 2,
        (p.y - (height * sy) / 2) * s - 2,
        width * sx * s + 4,
        height * sy * s + 4,
      );
    }
  }
}

function hit(x: number, y: number): number {
  const objects = state?.layout?.objects ?? [];
  for (let i = objects.length - 1; i >= 0; i--) {
    const p = objects[i]!;
    const { width, height } = sizeOf(p.type);
    const k = typeof p.scale === 'number' ? p.scale : (p.scale?.x ?? 1);
    if (Math.abs(x - p.x) <= (width * k) / 2 + 2 && Math.abs(y - p.y) <= (height * k) / 2 + 2)
      return i;
  }
  return -1;
}

function canvas(): HTMLCanvasElement {
  const c = h('canvas', { tabindex: 0, style: 'cursor:default;max-width:none' });
  const point = (event: MouseEvent) => {
    const rect = c.getBoundingClientRect();
    return { x: (event.clientX - rect.left) / scale(), y: (event.clientY - rect.top) / scale() };
  };
  c.addEventListener('mousedown', (event) => {
    const { x, y } = point(event);
    if (ui.tool) {
      edit({ op: 'add', placement: { type: ui.tool, x: snap(x), y: snap(y) } });
      ui.selected = state?.layout?.objects.length ?? -1;
      if (!event.shiftKey) ui.tool = '';
      return;
    }
    const index = hit(x, y);
    ui.selected = index;
    if (index >= 0) {
      const p = state!.layout!.objects[index]!;
      drag = { index, dx: x - p.x, dy: y - p.y, x: p.x, y: p.y };
    }
    view();
  });
  c.addEventListener('mousemove', (event) => {
    if (!drag) return;
    const { x, y } = point(event);
    drag.x = snap(x - drag.dx);
    drag.y = snap(y - drag.dy);
    drawWorld(c);
  });
  const drop = () => {
    if (!drag) return;
    const p = state!.layout!.objects[drag.index]!;
    if (p.x !== drag.x || p.y !== drag.y)
      edit({ op: 'move', index: drag.index, x: drag.x, y: drag.y });
    drag = undefined;
  };
  c.addEventListener('mouseup', drop);
  c.addEventListener('mouseleave', drop);
  c.addEventListener('keydown', (event) => {
    const p = state?.layout?.objects[ui.selected];
    if (!p) return;
    const step = event.shiftKey ? 10 : 1;
    const moves: Record<string, [number, number]> = {
      ArrowLeft: [-step, 0],
      ArrowRight: [step, 0],
      ArrowUp: [0, -step],
      ArrowDown: [0, step],
    };
    if (moves[event.key]) {
      event.preventDefault();
      edit({
        op: 'move',
        index: ui.selected,
        x: p.x + moves[event.key]![0],
        y: p.y + moves[event.key]![1],
      });
    } else if (event.key === 'Delete' || event.key === 'Backspace') {
      edit({ op: 'remove', index: ui.selected });
      ui.selected = -1;
    }
  });
  drawWorld(c);
  return c;
}

function inspector(): HTMLElement {
  const p = state?.layout?.objects[ui.selected];
  if (!p)
    return h(
      'div',
      { class: 'card' },
      h('h2', {}, 'Object'),
      h(
        'p',
        { class: 'muted' },
        'Select an object on the canvas, or pick one in the palette and click to place it.',
      ),
    );
  const index = ui.selected;
  const update = (patch: Partial<Placement>) => edit({ op: 'update', index, patch });
  return h(
    'div',
    { class: 'card' },
    h('h2', {}, `${p.type} · #${index}`),
    field(
      'X',
      numberInput('x', p.x, (v) => update({ x: v ?? 0 })),
    ),
    field(
      'Y',
      numberInput('y', p.y, (v) => update({ y: v ?? 0 })),
    ),
    field(
      'Layer',
      h(
        'select',
        {
          'data-key': 'layer',
          onchange: (e: Event) =>
            update({ layer: (e.target as HTMLSelectElement).value || undefined }),
        },
        h('option', { value: '' }, 'default'),
        state!.layers.map((l) => h('option', { value: l, selected: p.layer === l }, l)),
      ),
    ),
    field(
      'Angle',
      numberInput('angle', p.angle ?? 0, (v) => update({ angle: v ?? 0 })),
      'degrees',
    ),
    field(
      'Scale',
      numberInput(
        'scale',
        typeof p.scale === 'number' ? p.scale : 1,
        (v) => update({ scale: v ?? 1 }),
        { step: 0.1 },
      ),
    ),
    field(
      'Tags',
      textInput('tags', (p.tags ?? []).join(', '), (v) =>
        update({
          tags: v
            .split(',')
            .map((t) => t.trim())
            .filter(Boolean),
        }),
      ),
      'find them with scene.find(tag)',
    ),
    field(
      'Fields',
      h(
        'textarea',
        {
          'data-key': 'props',
          onchange: (e: Event) => {
            const text = (e.target as HTMLTextAreaElement).value.trim();
            try {
              update({ props: text ? (JSON.parse(text) as Record<string, unknown>) : undefined });
            } catch {
              (e.target as HTMLTextAreaElement).classList.add('error');
            }
          },
        },
        p.props ? JSON.stringify(p.props, null, 1) : '',
      ),
      'JSON of public fields, e.g. { "hp": 5 }',
    ),
    h(
      'div',
      { class: 'row' },
      h('button', { onclick: () => edit({ op: 'duplicate', index }) }, 'Duplicate'),
      h('button', { onclick: () => edit({ op: 'order', index, to: index + 1 }) }, 'Forward'),
      h('button', { onclick: () => edit({ op: 'order', index, to: index - 1 }) }, 'Back'),
      h(
        'button',
        { class: 'danger', onclick: () => ((ui.selected = -1), edit({ op: 'remove', index })) },
        'Delete',
      ),
    ),
  );
}

function view(): void {
  if (!state) return;
  render(
    h(
      'div',
      { class: 'row' },
      h('h1', { class: 'grow' }, `Scene ${state.scene}`),
      h('span', { class: 'muted' }, state.file),
    ),
    state.error && h('p', { class: 'error' }, `${state.error} Fix it in the text editor.`),
    h(
      'div',
      { class: 'layout layout--three' },
      h(
        'div',
        { class: 'card' },
        h('h2', {}, 'Objects'),
        h(
          'div',
          { class: 'list' },
          state.palette.map((entry) =>
            h(
              'div',
              {
                class: `list__item${ui.tool === entry.name ? ' selected' : ''}`,
                title: entry.folder,
                onclick: () => ((ui.tool = ui.tool === entry.name ? '' : entry.name), view()),
              },
              thumb(entry),
              entry.name,
            ),
          ),
        ),
        h(
          'p',
          { class: 'muted' },
          ui.tool
            ? `Click the scene to place ${ui.tool} (Shift keeps placing).`
            : 'Pick an object to place it.',
        ),
        field(
          'Snap',
          numberInput('snap', ui.snap, (v) => (ui.snap = Math.max(1, v ?? 1)), { min: 1 }),
        ),
        field(
          'Zoom',
          numberInput('zoom', ui.zoom, (v) => ((ui.zoom = Math.max(0, v ?? 0)), view()), {
            min: 0,
            step: 0.25,
          }),
          '0 fits the panel',
        ),
      ),
      h(
        'div',
        { class: 'card', style: 'overflow:auto' },
        canvas(),
        h(
          'p',
          { class: 'muted' },
          `${state.layout?.objects.length ?? 0} objects · world ${state.world.width} × ${state.world.height} · arrows nudge, Delete removes`,
        ),
      ),
      inspector(),
    ),
  );
}

function thumb(entry: SceneEditorState['palette'][number]): HTMLCanvasElement {
  const c = h('canvas', { class: 'checker', style: 'border-radius:4px' });
  c.width = 28;
  c.height = 28;
  if (entry.imageUrl) {
    const img = image(entry.imageUrl, () => {
      const f = entry.frame ?? { x: 0, y: 0, width: img.naturalWidth, height: img.naturalHeight };
      const k = Math.min(28 / f.width, 28 / f.height);
      const ctx = c.getContext('2d')!;
      ctx.imageSmoothingEnabled = false;
      ctx.drawImage(
        img,
        f.x,
        f.y,
        f.width,
        f.height,
        (28 - f.width * k) / 2,
        (28 - f.height * k) / 2,
        f.width * k,
        f.height * k,
      );
    });
  }
  return c;
}

connect<SceneEditorState>((next) => {
  state = next;
  view();
});
window.addEventListener('resize', () => view());
