import { EventBus, InputManager, Settings } from '@blacklight/core';
import type { Game } from '@blacklight/core';
import { nextTick } from 'vue';
import { UiRuntime } from '../src/runtime';

/** A game stand-in with real input, events and settings, and no renderer. */
export function fakeGame(): Game & { stepOnce(): void } {
  const mount = document.createElement('div');
  document.body.append(mount);
  const events = new EventBus();
  const input = new InputManager({}, undefined, () => []);
  const played: string[] = [];
  const game = {
    mount,
    events,
    input,
    paused: false,
    settings: new Settings('test'),
    safeArea: { x: 0, y: 0, width: 1920, height: 1080 },
    config: { resolution: { width: 1920, height: 1080 } },
    app: { canvas: document.createElement('canvas') },
    audio: { play: (key: string) => played.push(key) },
    time: { dt: 1 / 60 },
    viewport: undefined,
    played,
    stepOnce() {
      input.update();
      events.emit('step', { step: 0 });
    },
  };
  return game as unknown as Game & { stepOnce(): void };
}

/** Installs the UI on a fake game. */
export function installUi() {
  const game = fakeGame();
  const runtime = new UiRuntime(game);
  game.ui = runtime;
  return { game, runtime };
}

/** Gives elements fixed boxes (happy-dom has no layout). */
export function place(element: Element, x: number, y: number, width = 100, height = 40): void {
  element.getBoundingClientRect = () =>
    ({
      x,
      y,
      left: x,
      top: y,
      width,
      height,
      right: x + width,
      bottom: y + height,
      toJSON() {},
    }) as DOMRect;
}

export async function settle(): Promise<void> {
  for (let i = 0; i < 4; i++) {
    await nextTick();
    await new Promise((r) => setTimeout(r, 0));
  }
}
