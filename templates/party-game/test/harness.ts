// Runs mini-games without a browser: offline on one headless game with scripted players, online
// as several headless instances linked by the simulated network of @blacklight/net (or by a real
// relay connection, see `onlineInstance`).
import { InputManager, type ActionName, type Game } from '@blacklight/core';
import type { OnlineMatch, SceneRollback } from '@blacklight/net';
import {
  headlessGame,
  headlessScene,
  simulateMatch,
  type MatchResult,
  type NetworkConditions,
} from '@blacklight/net/testing';
import config from '../game.config';
import type { MiniGameSettings } from '../party/catalog';
import type { Contestant, MiniGame } from '../party/minigame';
import { PLAY } from '../party/rules';

/** Actions a scripted player holds during one step. */
export type Script = (player: number, step: number, scene: MiniGame) => readonly ActionName[];

export const idle: Script = () => [];

/** Integer hash: the same bot plays the same way on every machine. */
function hash(a: number, b: number): number {
  let h = Math.imul(a ^ 0x9e3779b9, 0x85ebca6b) ^ Math.imul(b, 0xc2b2ae35);
  h ^= h >>> 15;
  h = Math.imul(h, 0x2c1b3c6d);
  h ^= h >>> 12;
  return h >>> 0;
}

const MOVES: (readonly ActionName[])[] = [
  ['right'],
  ['right', 'down'],
  ['down'],
  ['left', 'down'],
  ['left'],
  ['left', 'up'],
  ['up'],
  ['right', 'up'],
  [],
];

/** Holds a direction for a third of a second, taps action/confirm now and then, uses its card. */
export const bot: Script = (player, step) => {
  const h = hash(player, Math.floor(step / 20));
  const actions: ActionName[] = [...MOVES[h % MOVES.length]!];
  if ((h >>> 8) % 3 === 0 && step % 20 < 3) actions.push('action', 'confirm');
  if (step === 400 + player * 60) actions.push('card');
  return actions;
};

export function contestants(count: number): Contestant[] {
  return Array.from({ length: count }, (_, i) => ({
    player: i + 1,
    skin: i,
    name: `P${i + 1}`,
  }));
}

/** A headless game with the action map of game.config.ts (the `card` action). */
function partyGame(): Game {
  const game = headlessGame({ width: PLAY.width, height: PLAY.height });
  Object.assign(game, { input: new InputManager(config.input, undefined, () => []) });
  return game;
}

function hold(game: Game, player: number, actions: readonly ActionName[]): void {
  const input = game.input.player(player);
  input.joined = true;
  input.virtual.clear();
  for (const action of actions) input.virtual.set(action, 1);
}

/** Plays a mini-game offline until it is finished (or `maxSteps`). */
export async function playOffline<S extends MiniGame>(
  Scene: new () => S,
  name: string,
  options: {
    players: number;
    settings: MiniGameSettings;
    script?: Script;
    maxSteps?: number;
    /** Seed of the game's random; the mini-game name by default. */
    seed?: string;
  },
): Promise<{ scene: S; steps: number }> {
  const game = partyGame();
  game.random.seed(options.seed ?? name);
  const scene = await headlessScene(
    Scene,
    name,
    { players: contestants(options.players), settings: options.settings },
    game,
  );
  const script = options.script ?? idle;
  const max = options.maxSteps ?? 60 * 60 * 5;
  let steps = 0;
  while (!scene.referee.finished && steps < max) {
    for (let p = 1; p <= options.players; p++) hold(game, p, script(p, steps, scene));
    game.input.update();
    scene.step(game.time.dt);
    steps++;
  }
  return { scene, steps };
}

/** One online player's machine: a headless game running the mini-game on a match. */
export interface OnlineInstance<S extends MiniGame> {
  scene: S;
  /** One fixed step of this machine: its local player's scripted input, then the scene. */
  tick(): void;
  session: SceneRollback['session'];
}

/**
 * Builds one machine of an online match, whatever carries the match: the simulated network of
 * `playOnline` or a real relay connection (`RelayClient.match()`).
 */
export async function onlineInstance<S extends MiniGame>(
  Scene: new () => S,
  name: string,
  match: OnlineMatch,
  options: { settings: MiniGameSettings; script?: Script },
): Promise<OnlineInstance<S>> {
  const game = partyGame();
  const scene = await headlessScene(
    Scene,
    name,
    {
      players: match.players.map((p) => ({ player: p.number, skin: p.number - 1, name: p.name })),
      settings: options.settings,
      online: match,
      delay: 2,
    },
    game,
  );
  const script = options.script ?? bot;
  const self = match.local[0]!;
  let step = 0;
  return {
    scene,
    tick: () => {
      // The local device is player 1 of each machine; the session sends it as `self`.
      hold(game, 1, script(self, step++, scene));
      game.input.update();
      scene.step(game.time.dt);
    },
    session: scene.net!.session,
  };
}

/** Plays a mini-game online: one headless instance per player over a simulated network. */
export async function playOnline<S extends MiniGame>(
  Scene: new () => S,
  name: string,
  options: {
    players: number;
    settings: MiniGameSettings;
    frames: number;
    network?: NetworkConditions;
    script?: Script;
  },
): Promise<{ result: MatchResult; scenes: S[] }> {
  const scenes: S[] = [];
  const result = await simulateMatch({
    players: options.players,
    frames: options.frames,
    seed: name,
    network: options.network ?? { latency: 120, jitter: 20, loss: 0.02 },
    create: async (match) => {
      const instance = await onlineInstance(Scene, name, match, options);
      scenes.push(instance.scene);
      return instance;
    },
  });
  return { result, scenes };
}
