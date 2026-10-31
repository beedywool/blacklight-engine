// Dev-only channel between the running game and tools (the VS Code extension): object list,
// variables, pause/step, UI preview. Messages travel over the dev server's WebSocket
// (`import.meta.hot`), which the CLI relays to every connected client.
import type { Game } from '../game';
import type { GameObject } from '../objects/game-object';
import type { ObjectSnapshot, Scene } from '../scene';

/** Name of the custom HMR event every message uses. */
export const DEBUG_EVENT = 'blacklight:debug';

/** A tool asks one game (or every game when `target` is omitted). */
export interface DebugRequest {
  /** Message type. */
  kind: 'request';
  /** Chosen by the tool; the response carries it back. */
  id: string;
  /** Name of the method to run (`objects`, `inspect`, `pause`…). */
  method: string;
  /** Arguments of the method. */
  params?: Record<string, unknown>;
  /** Client id of the game that should answer. */
  target?: string;
}

/** The game's answer to a request. */
export interface DebugResponse {
  /** Message type. */
  kind: 'response';
  /** Id of the request being answered. */
  id: string;
  /** Client id of the answering game. */
  client: string;
  /** What the method returned, as JSON. */
  result?: unknown;
  /** Error message when the method failed or does not exist. */
  error?: string;
}

/** Sent by the game without a request (`hello` when it starts). */
export interface DebugEvent {
  /** Message type. */
  kind: 'event';
  /** Client id of the game sending it. */
  client: string;
  /** Event name: `hello` at start, `scene` when the scene changes. */
  type: string;
  /** Event payload, as JSON. */
  data?: unknown;
}

/** Any message of the debug channel, told apart by `kind`. */
export type DebugMessage = DebugRequest | DebugResponse | DebugEvent;

/** The part of `import.meta.hot` the channel uses. */
export interface HotChannel {
  /** Listens to a custom event from the dev server. */
  on(event: string, listener: (data: unknown) => void): void;
  /** Sends a custom event to the dev server, which relays it to the tools. */
  send(event: string, data?: unknown): void;
}

/** A method tools can call; `params` comes from the request. */
export type DebugMethod = (params: Record<string, unknown>) => unknown;

/** One object in the live list. */
export interface DebugObjectSummary {
  /** Object id in its scene. */
  id: number;
  /** Registered name of its class. */
  type: string;
  /** Name of the scene it lives in. */
  scene: string;
  /** Position, in world pixels. */
  x: number;
  /** Position, in world pixels. */
  y: number;
  /** Its layer, `undefined` for children of other objects. */
  layer: string | undefined;
  /** Its tags. */
  tags: string[];
}

/** Shape of `@blacklight/ui`'s focus manager, read without importing the UI package. */
interface FocusLike {
  focusables(): HTMLElement[];
  focus(element: HTMLElement | null, options?: { sound?: boolean }): void;
}

function sceneList(game: Game): Scene<never>[] {
  const out: Scene<never>[] = [];
  const visit = (scene: Scene<never> | undefined) => {
    if (!scene) return;
    out.push(scene);
    scene.hosted.forEach(visit);
  };
  visit(game.scene);
  game.overlays.forEach((o) => visit(o.scene));
  return out;
}

function findObject(game: Game, id: number, sceneName?: string): GameObject {
  for (const scene of sceneList(game)) {
    if (sceneName && scene.name !== sceneName) continue;
    const object = scene.byId(id);
    if (object) return object;
  }
  throw new Error(
    `No object ${id}${sceneName ? ` in scene "${sceneName}"` : ''}: it was destroyed or the scene changed. Refresh the list.`,
  );
}

function inspect(object: GameObject): ObjectSnapshot {
  const saved = object.scene.snapshot().objects.find((o) => o.id === object.id);
  if (!saved) throw new Error(`Object ${object.id} is not alive any more.`);
  return saved;
}

/** Sets `path` (`hp`, `core.x`, `behaviors.0.speed`, `data.stats.attack`) on a live object. */
function setValue(object: GameObject, path: string, value: unknown): void {
  const parts = path.split('.');
  const head = parts.shift();
  let target: Record<string, unknown>;
  if (head === 'core') {
    const key = parts[0];
    if (key === 'x' || key === 'y') {
      object.teleport(
        key === 'x' ? Number(value) : object.x,
        key === 'y' ? Number(value) : object.y,
      );
      return;
    }
    if (key === 'vx' || key === 'vy') {
      object.velocity[key === 'vx' ? 'x' : 'y'] = Number(value);
      return;
    }
    if (key === 'scaleX' || key === 'scaleY') {
      object.scale[key === 'scaleX' ? 'x' : 'y'] = Number(value);
      return;
    }
    target = object as unknown as Record<string, unknown>;
  } else if (head === 'behaviors') {
    target = object.behaviors[Number(parts.shift())] as unknown as Record<string, unknown>;
  } else if (head === 'data') {
    target = object as unknown as Record<string, unknown>;
  } else {
    target = object as unknown as Record<string, unknown>;
    parts.unshift(head!);
  }
  const last = parts.pop();
  for (const part of parts) target = target?.[part] as Record<string, unknown>;
  if (!target || last === undefined)
    throw new Error(`Cannot set "${path}" on object ${object.id}.`);
  target[last] = value;
}

function label(element: HTMLElement): string {
  const text = element.getAttribute('aria-label') ?? element.textContent ?? '';
  return text.replace(/\s+/g, ' ').trim().slice(0, 60) || element.tagName.toLowerCase();
}

function focusOf(game: Game): FocusLike | undefined {
  const focus = (game.ui as { focus?: Partial<FocusLike> } | undefined)?.focus;
  return focus && typeof focus.focusables === 'function' && typeof focus.focus === 'function'
    ? (focus as FocusLike)
    : undefined;
}

/** The built-in methods; `installDebugChannel` returns the map so the entry can add more. */
function builtins(game: Game, client: string): Record<string, DebugMethod> {
  return {
    hello: () => ({
      client,
      url: globalThis.location?.href,
      title: game.config.name,
      scene: game.scene?.name,
    }),
    objects: () => ({
      scene: game.scene?.name,
      paused: game.paused,
      step: game.time.step,
      objects: sceneList(game).flatMap((scene) =>
        scene.objects
          .filter((o) => o.alive)
          .map<DebugObjectSummary>((o) => ({
            id: o.id,
            type: o.objectName,
            scene: scene.name,
            x: Math.round(o.x * 100) / 100,
            y: Math.round(o.y * 100) / 100,
            layer: o.parent?.label || undefined,
            tags: [...o.tags],
          })),
      ),
    }),
    inspect: ({ id, scene }) => inspect(findObject(game, Number(id), scene as string | undefined)),
    set: ({ id, scene, path, value }) => {
      const object = findObject(game, Number(id), scene as string | undefined);
      setValue(object, String(path), value);
      return inspect(object);
    },
    pause: () => (game.pause(), { paused: true }),
    resume: () => (game.resume(), { paused: false }),
    step: ({ count }) => (game.step(Number(count ?? 1)), { step: game.time.step }),
    goto: async ({ scene }) => (
      await game.goto(String(scene) as never),
      { scene: game.scene?.name }
    ),
    'ui.open': ({ screen, props }) => {
      if (!game.scene) throw new Error('No scene is running yet.');
      game.scene.ui.push(String(screen), (props as Record<string, unknown>) ?? {});
      return { screen };
    },
    'ui.focusables': () => {
      const focus = focusOf(game);
      const elements = focus?.focusables() ?? [];
      return elements.map((element, index) => ({
        index,
        label: label(element),
        focused: element.hasAttribute('data-bl-focused'),
      }));
    },
    'ui.focus': ({ index }) => {
      const focus = focusOf(game);
      if (!focus) throw new Error('No UI layer: the game does not use @blacklight/ui.');
      const element = focus.focusables()[Number(index)];
      if (!element) throw new Error(`No focusable element ${index} on the top screen.`);
      focus.focus(element, { sound: false });
      return { index, label: label(element) };
    },
  };
}

/**
 * Answers tool requests over the dev server's WebSocket. The generated entry installs it in dev
 * with `import.meta.hot`; release builds do not contain it.
 *
 * @returns The method table (add your own) and a function that stops answering.
 * @example
 * ```ts
 * if (import.meta.hot) {
 *   const channel = installDebugChannel(game, import.meta.hot);
 *   channel.methods.score = () => game.scene?.find('Player');
 * }
 * ```
 */
export function installDebugChannel(
  game: Game,
  hot: HotChannel,
  options: { client?: string } = {},
): {
  /** Id of this game on the channel (from `?blacklight-client=` or random). */
  client: string;
  /** Methods tools can call, by name; add entries to expose your own. */
  methods: Record<string, DebugMethod>;
  /** Stops answering requests. */
  dispose(): void;
} {
  const client =
    options.client ??
    new URLSearchParams(globalThis.location?.search).get('blacklight-client') ??
    `game-${Math.random().toString(36).slice(2, 10)}`;
  const methods = builtins(game, client);
  let active = true;
  const reply = (message: Omit<DebugResponse, 'kind' | 'client'>) =>
    hot.send(DEBUG_EVENT, { kind: 'response', client, ...message } satisfies DebugResponse);
  hot.on(DEBUG_EVENT, (data) => {
    const message = data as DebugMessage;
    if (!active || message?.kind !== 'request') return;
    if (message.target && message.target !== client) return;
    const method = methods[message.method];
    if (!method) {
      reply({
        id: message.id,
        error: `Unknown debug method "${message.method}". Known: ${Object.keys(methods).join(', ')}.`,
      });
      return;
    }
    Promise.resolve()
      .then(() => method(message.params ?? {}))
      .then(
        (result) => reply({ id: message.id, result: JSON.parse(JSON.stringify(result ?? null)) }),
        (error: unknown) =>
          reply({ id: message.id, error: error instanceof Error ? error.message : String(error) }),
      );
  });
  const announce = () =>
    hot.send(DEBUG_EVENT, {
      kind: 'event',
      client,
      type: 'scene',
      data: { scene: game.scene?.name },
    } satisfies DebugEvent);
  const off = game.events.on('scene', announce);
  hot.send(DEBUG_EVENT, {
    kind: 'event',
    client,
    type: 'hello',
    data: methods.hello!({}),
  } satisfies DebugEvent);
  return {
    client,
    methods,
    dispose() {
      active = false;
      off();
    },
  };
}
