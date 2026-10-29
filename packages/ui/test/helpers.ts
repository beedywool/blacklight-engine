import { EventBus, InputManager, Settings } from '@blacklight/core';
import type { Game, Transition } from '@blacklight/core';
import { nextTick } from 'vue';
import { UiRuntime, type UiOptions } from '../src/runtime';

/** Files of the fake asset store: project path → content (JSON for `.json`, else a URL). */
export type FakeFiles = Record<string, unknown>;

let gameCount = 0;

/** A game stand-in with real input, events and settings, and no renderer. */
export function fakeGame(files: FakeFiles = {}): Game & {
  stepOnce(): void;
  played: string[];
  stored: Map<string, Uint8Array>;
} {
  const mount = document.createElement('div');
  document.body.append(mount);
  const events = new EventBus();
  const input = new InputManager({}, undefined, () => []);
  const played: string[] = [];
  const volumes: Record<string, number> = { master: 1, music: 0.8, sfx: 1, voice: 1, ui: 1 };
  const stored = new Map<string, Uint8Array>();
  const loaded = new Map<string, unknown>();
  const key = (p: string) => p.slice(p.lastIndexOf('/') + 1).split('.')[0];
  const game = {
    mount,
    events,
    input,
    paused: false,
    settings: new Settings(`test-${++gameCount}`),
    safeArea: { x: 0, y: 0, width: 1920, height: 1080 },
    config: { resolution: { width: 1920, height: 1080 }, entry: 'title', locales: undefined },
    app: { canvas: document.createElement('canvas') },
    world: { filters: null, position: { x: 0, y: 0 }, scale: { x: 1, y: 1 } },
    transitions: new Map<string, Transition>(),
    audio: {
      play: (name: string) => {
        played.push(name);
        return { key: name, ended: Promise.resolve(), stop() {}, setVolume() {}, setPosition() {} };
      },
      volume: (bus: string, value?: number) => {
        if (value !== undefined) volumes[bus] = value;
        return volumes[bus] ?? 1;
      },
      music: (name: string) => played.push(`music:${name}`),
      stopMusic: () => played.push('music:stop'),
    },
    assets: {
      paths: Object.keys(files),
      url: (path: string) => (path in files ? `/${path}` : undefined),
      find: (name: string, options: { extensions?: string[] } = {}) => {
        const found = Object.keys(files).filter(
          (p) =>
            (key(p) === name || p === name || p.slice(0, p.lastIndexOf('.')) === name) &&
            (!options.extensions || options.extensions.includes(p.split('.').pop()!)),
        );
        if (found.length === 0) throw new Error(`No asset named "${name}".`);
        return found;
      },
      load: async (paths: string[]) => {
        for (const path of paths) loaded.set(path, files[path]);
      },
      getJson: (path: string) => {
        if (!loaded.has(path)) throw new Error(`"${path}" is not loaded.`);
        return loaded.get(path);
      },
    },
    platform: {
      name: 'web',
      files: {
        read: async (path: string) => stored.get(path),
        write: async (path: string, data: Uint8Array) => void stored.set(path, data),
        remove: async (path: string) => void stored.delete(path),
        list: async (prefix = '') => [...stored.keys()].filter((p) => p.startsWith(prefix)),
      },
      quit() {},
    },
    pause() {
      game.paused = true;
    },
    resume() {
      game.paused = false;
    },
    goto: async () => {},
    time: { dt: 1 / 60 },
    viewport: undefined,
    played,
    stored,
    stepOnce() {
      input.update();
      events.emit('step', { step: 0 });
    },
  };
  return game as unknown as Game & {
    stepOnce(): void;
    played: string[];
    stored: Map<string, Uint8Array>;
  };
}

/** Installs the UI on a fake game. */
export function installUi(files: FakeFiles = {}, options: UiOptions = {}) {
  const game = fakeGame(files);
  const runtime = new UiRuntime(game, options);
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

/** Waits `ms` of real time. */
export const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));
