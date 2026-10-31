import { afterEach } from 'vitest';
import { createGame, type CreateGameOptions, type Game } from '../../src/game';
import type { GameConfig } from '../../src/config';
import { Scene } from '../../src/scene';
import type { SceneClass } from '../../src/scenes';

/** Draws a PNG in a canvas: `paint` gets a 2D context of `width × height`. */
export function png(
  width: number,
  height: number,
  paint: (context: CanvasRenderingContext2D) => void,
): string {
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  paint(canvas.getContext('2d')!);
  return canvas.toDataURL('image/png');
}

/** A PNG of `columns × rows` cells of `size` pixels, each cell a different solid color. */
export function gridPng(columns: number, rows: number, size: number): string {
  return png(columns * size, rows * size, (context) => {
    for (let row = 0; row < rows; row++) {
      for (let column = 0; column < columns; column++) {
        context.fillStyle = `rgb(${column * 40}, ${row * 40}, 200)`;
        context.fillRect(column * size, row * size, size, size);
      }
    }
  });
}

/** A mono 16-bit PCM WAV file of `seconds` of a 440 Hz tone, as a blob URL. */
export function wavUrl(seconds = 0.05, rate = 8000): string {
  const samples = Math.max(1, Math.round(seconds * rate));
  const view = new DataView(new ArrayBuffer(44 + samples * 2));
  const text = (offset: number, value: string) =>
    [...value].forEach((c, i) => view.setUint8(offset + i, c.charCodeAt(0)));
  text(0, 'RIFF');
  view.setUint32(4, 36 + samples * 2, true);
  text(8, 'WAVE');
  text(12, 'fmt ');
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, 1, true);
  view.setUint32(24, rate, true);
  view.setUint32(28, rate * 2, true);
  view.setUint16(32, 2, true);
  view.setUint16(34, 16, true);
  text(36, 'data');
  view.setUint32(40, samples * 2, true);
  for (let i = 0; i < samples; i++)
    view.setInt16(44 + i * 2, Math.round(Math.sin((i / rate) * 440 * 2 * Math.PI) * 8000), true);
  return URL.createObjectURL(new Blob([view.buffer], { type: 'audio/wav' }));
}

/** A blob URL serving `content` (JSON is stringified). */
export function fileUrl(content: unknown, type = 'application/json'): string {
  const body = typeof content === 'string' ? content : JSON.stringify(content);
  return URL.createObjectURL(new Blob([body], { type }));
}

export const CONFIG: GameConfig = {
  name: 'Browser Test',
  id: 'com.blacklight.browsertest',
  version: '1.0.0',
  entry: 'main',
  resolution: { width: 320, height: 180 },
  seed: 7,
};

const running: { game?: Game; mount: HTMLElement }[] = [];

afterEach(async () => {
  for (const { game, mount } of running.splice(0)) {
    await game?.destroy();
    mount.remove();
  }
});

/** A mount element of the given CSS size, removed after the test. */
export function mount(width = 640, height = 360): HTMLElement {
  const element = document.createElement('div');
  element.style.cssText = `width:${width}px;height:${height}px`;
  document.body.append(element);
  running.push({ mount: element });
  return element;
}

/** Scene loaders for `createGame` from scene classes by name. */
export function scenes(map: Record<string, abstract new () => Scene<never>>) {
  return Object.fromEntries(
    Object.entries(map).map(([name, type]) => [
      name,
      () => Promise.resolve({ default: type as unknown as SceneClass }),
    ]),
  );
}

/**
 * Starts a real game (WebGL renderer, ticker, DOM listeners) in a 640×360 mount; destroyed after
 * the test. The entry scene is `main` unless the config says otherwise.
 */
export async function startGame(
  options: Partial<CreateGameOptions> & { scenes: CreateGameOptions['scenes'] },
  config: Partial<GameConfig> = {},
): Promise<Game> {
  const element = options.mount ?? mount();
  const entry = running.find((r) => r.mount === element) ?? { mount: element };
  if (!running.includes(entry)) running.push(entry);
  const game = await createGame({ ...CONFIG, ...config }, { ...options, mount: element });
  entry.game = game;
  return game;
}

/** Resolves after `count` animation frames. */
export function frames(count = 1): Promise<void> {
  return new Promise((resolve) => {
    const next = (left: number) =>
      left === 0 ? resolve() : requestAnimationFrame(() => next(left - 1));
    next(count);
  });
}

/** Resolves once `check` returns true, polling every frame (fails after `timeout` ms). */
export async function until(check: () => boolean, timeout = 2000): Promise<void> {
  const start = performance.now();
  while (!check()) {
    if (performance.now() - start > timeout) throw new Error('Condition not met in time');
    await frames(1);
  }
}

/** A scene class with no behaviour of its own. */
export class Empty extends Scene {}
