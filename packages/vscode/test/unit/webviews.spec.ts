// @vitest-environment happy-dom
// The extension's pages render each state the extension sends and post the messages the
// controllers expect (the controllers themselves are covered by the integration tests).
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

let posted: Record<string, unknown>[];
const listeners: [string, EventListenerOrEventListenerObject][] = [];
const addEventListener = window.addEventListener.bind(window);
const requestFrame = window.requestAnimationFrame.bind(window);

beforeEach(() => {
  vi.resetModules();
  // Pages listen on the shared window; each test removes what its page added.
  window.addEventListener = ((
    type: string,
    listener: EventListenerOrEventListenerObject,
    options?: unknown,
  ) => {
    listeners.push([type, listener]);
    addEventListener(type, listener, options as AddEventListenerOptions);
  }) as typeof window.addEventListener;
  window.requestAnimationFrame = requestFrame;
  posted = [];
  document.body.innerHTML = '<div id="app"></div>';
  (globalThis as unknown as { acquireVsCodeApi: () => unknown }).acquireVsCodeApi = () => ({
    postMessage: (message: Record<string, unknown>) => posted.push(message),
    getState: () => undefined,
    setState: () => {},
  });
  // happy-dom has no 2D canvas: drawing calls do nothing.
  const context = new Proxy({}, { get: () => () => {} });
  HTMLCanvasElement.prototype.getContext = (() => context) as never;
});
afterEach(() => {
  for (const [type, listener] of listeners.splice(0)) window.removeEventListener(type, listener);
  // Stops the preview loops of the page under test.
  window.requestAnimationFrame = () => 0;
});

async function page(name: string, state: unknown): Promise<HTMLElement> {
  await import(`../../webview/${name}.ts`);
  expect(posted[0]).toEqual({ type: 'ready' });
  window.dispatchEvent(new MessageEvent('message', { data: { type: 'state', state } }));
  return document.getElementById('app')!;
}

function click(element: Element | null | undefined): void {
  if (!element) throw new Error('element not found');
  element.dispatchEvent(new MouseEvent('click', { bubbles: true }));
}

function change(element: Element | null | undefined, value: string): void {
  if (!element) throw new Error('element not found');
  (element as HTMLInputElement).value = value;
  element.dispatchEvent(new Event('change', { bubbles: true }));
}

const button = (app: HTMLElement, text: string) =>
  [...app.querySelectorAll('button')].find((b) => b.textContent === text);

describe('webview pages', () => {
  it('animation editor', async () => {
    const app = await page('animation', {
      file: 'objects/hero/hero.anim.json',
      json: {
        source: './hero@16x16.png',
        animations: { idle: { frames: [0, 1], fps: 2 }, run: { frames: { from: 2, to: 3 } } },
      },
      preview: {
        image: 'hero@16x16.png',
        default: 'idle',
        animations: [
          {
            name: 'idle',
            frames: [{ x: 0, y: 0, width: 16, height: 16 }],
            durations: [500],
            loop: true,
            events: {},
          },
          {
            name: 'run',
            frames: [{ x: 32, y: 0, width: 16, height: 16 }],
            durations: [100],
            loop: true,
            events: {},
          },
        ],
      },
      imageUrl: 'hero.png',
      version: 1,
    });
    expect(app.textContent).toContain('objects/hero/hero.anim.json');
    change(app.querySelector('[data-key="idle.fps"]'), '6');
    expect(posted.at(-1)).toEqual({ type: 'set', animation: 'idle', key: 'fps', value: 6 });
    change(app.querySelector('[data-key="idle.frames"]'), '0-3');
    expect(posted.at(-1)).toEqual({
      type: 'set',
      animation: 'idle',
      key: 'frames',
      value: { from: 0, to: 3 },
    });
    change(app.querySelector('[data-key="idle.events"]'), '1:step, 3:step|dust');
    expect(posted.at(-1)).toMatchObject({
      key: 'events',
      value: { 1: 'step', 3: ['step', 'dust'] },
    });
  });

  it('sprite-sheet slicer', async () => {
    const app = await page('slicer', {
      file: 'objects/slime/slime.png',
      imageUrl: 'slime.png',
      width: 64,
      height: 16,
      slice: { spec: { width: 16, height: 16, spacing: 0 }, columns: 4, rows: 1, frames: [] },
      gridName: 'slime@16x16.png',
    });
    expect(app.textContent).toContain('64 × 16 px');
    change(app.querySelector('[data-key="width"]'), '32');
    expect(posted.at(-1)).toEqual({ type: 'grid', width: 32, height: 16, spacing: 0 });
    click(button(app, 'Save'));
    expect(posted.at(-1)).toMatchObject({ type: 'save', fps: 10, rename: true });
  });

  it('scene editor', async () => {
    const app = await page('scene', {
      file: 'scenes/arena/arena.layout.json',
      scene: 'arena',
      layout: { objects: [{ type: 'Hero', x: 10, y: 20 }] },
      resolution: { width: 320, height: 180 },
      world: { width: 320, height: 180 },
      layers: ['main'],
      palette: [{ name: 'Hero', folder: 'objects/hero' }],
    });
    expect(app.textContent).toContain('Scene arena');
    expect(app.textContent).toContain('1 objects');
    click([...app.querySelectorAll('.list__item')].find((e) => e.textContent?.includes('Hero')));
    expect(document.getElementById('app')!.textContent).toContain('Click the scene to place Hero');
  });

  it('timeline editor', async () => {
    const app = await page('timeline', {
      file: 'animations/intro.timeline.json',
      timeline: { steps: [{ to: '.title', keyframes: { opacity: [0, 1] }, duration: 0.2 }] },
      rows: [{ index: 0, kind: 'to', title: '.title → opacity', start: 0, duration: 0.2 }],
      duration: 0.2,
      live: false,
    });
    expect(app.querySelectorAll('.timeline-bar')).toHaveLength(1);
    change(app.querySelector('[data-key="duration"]'), '0.5');
    expect(posted.at(-1)).toEqual({
      type: 'edit',
      edit: {
        op: 'update',
        index: 0,
        step: { to: '.title', keyframes: { opacity: [0, 1] }, duration: 0.5 },
      },
    });
    click(button(app, '+ Label'));
    expect(posted.at(-1)).toMatchObject({
      type: 'edit',
      edit: { op: 'add', step: { label: 'label-1' } },
    });
  });

  it('UI preview', async () => {
    const app = await page('ui-preview', {
      file: 'ui/Menu.vue',
      screen: 'Menu',
      url: 'http://localhost:5371/?blacklight-client=preview-1',
      clientId: 'preview-1',
      ready: true,
      focusables: [
        { index: 0, label: 'Resume', focused: true },
        { index: 1, label: 'Quit', focused: false },
      ],
    });
    expect(app.querySelector('iframe')?.getAttribute('src')).toBe(
      'http://localhost:5371/?blacklight-client=preview-1',
    );
    click([...app.querySelectorAll('.list__item')].find((e) => e.textContent?.includes('Quit')));
    expect(posted.at(-1)).toEqual({ type: 'focus', index: 1 });
  });

  it('config form', async () => {
    const app = await page('config', {
      file: 'game.config.ts',
      fields: [
        { path: 'name', label: 'Name', type: 'string', required: true, description: '' },
        { path: 'resolution.width', label: 'Width', type: 'number', description: '' },
        { path: 'input.actions', label: 'Input actions', type: 'actions', description: '' },
      ],
      values: { name: 'Game', 'resolution.width': 320, 'input.actions': { fire: ['KeyF'] } },
      computed: [],
      scenes: ['arena'],
    });
    change(app.querySelector('[data-key="resolution.width"]'), '640');
    expect(posted.at(-1)).toEqual({ type: 'set', path: 'resolution.width', value: 640 });
    change(app.querySelector('[data-key="action.fire"]'), 'KeyF, Pad:RT');
    expect(posted.at(-1)).toEqual({
      type: 'set',
      path: 'input.actions',
      value: { fire: ['KeyF', 'Pad:RT'] },
    });
  });

  it('asset browser', async () => {
    const app = await page('assets', {
      root: '/game',
      assets: [
        {
          path: 'assets/a.png',
          bytes: 2048,
          kind: 'image',
          used: true,
          usedBy: 'x',
          scenes: ['arena'],
        },
        { path: 'assets/old.ogg', bytes: 10, kind: 'audio', used: false, scenes: [] },
      ],
      scenes: [
        {
          scene: 'arena',
          bytes: 2048,
          files: [{ path: 'assets/a.png', bytes: 2048, reason: 'static assets' }],
        },
      ],
      totalBytes: 2058,
      thumbnails: { 'assets/a.png': 'a.png' },
    });
    expect(app.querySelectorAll('.thumb')).toHaveLength(2);
    expect(app.querySelectorAll('.badge--warn')).toHaveLength(1);
    click(app.querySelector('.thumb'));
    expect(posted.at(-1)).toEqual({ type: 'open', path: 'assets/a.png' });
    click(button(app, 'Weight per scene'));
    expect(document.getElementById('app')!.textContent).toContain('2.0 KB');
  });
});
