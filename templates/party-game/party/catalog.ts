// The mini-games of the party: what the game-select cards show and what the match shell hosts.
import type { SceneName } from '@blacklight/core';

/** One of the two settings of a mini-game: a label and its choices (the value is the index). */
export interface MiniGameSetting {
  label: string;
  options: readonly string[];
  /** Index chosen by default. @defaultValue `0` */
  initial?: number;
}

export interface MiniGameInfo {
  /** Scene that runs the mini-game (hosted by the match shell). */
  scene: SceneName;
  title: string;
  description: string;
  minPlayers: number;
  maxPlayers: number;
  settings: readonly [MiniGameSetting, MiniGameSetting];
  /** Card art (`assets/cards/<scene>.svg`). */
  art: string;
}

/** Index of a choice in each of the two settings. */
export type MiniGameSettings = [number, number];

export const MINI_GAMES = [
  {
    scene: 'survival-vs',
    title: 'SURVIVAL VS',
    description: 'Dodge the bouncing enemies. Three hits and you are out; one point per second.',
    minPlayers: 1,
    maxPlayers: 8,
    settings: [
      { label: 'ARENA', options: ['OPEN', 'PILLARS', 'CROSS'] },
      { label: 'ENEMIES', options: ['1', '2', '3'], initial: 1 },
    ],
    art: '@assets/cards/survival-vs',
  },
  {
    scene: 'air-hockey',
    title: 'AIR HOCKEY',
    description: 'Two teams, one puck. Each goal scores a point for the whole team.',
    minPlayers: 2,
    maxPlayers: 8,
    settings: [
      { label: 'TEAMS', options: ['ALTERNATE', 'HALVES', 'ONE VS ALL'] },
      { label: 'GOALS TO WIN', options: ['3', '5', '7', '10'], initial: 1 },
    ],
    art: '@assets/cards/air-hockey',
  },
  {
    scene: 'fifty-fifty',
    title: '50-50',
    description: 'Pick a door before it opens. The cloud strikes one side; one point per round.',
    minPlayers: 1,
    maxPlayers: 8,
    settings: [
      { label: 'MODE', options: ['LAST STANDING', 'ALL OUT'] },
      { label: 'LIVES', options: ['1', '2', '3'], initial: 1 },
    ],
    art: '@assets/cards/fifty-fifty',
  },
  {
    scene: 'obstacles',
    title: 'OBSTACLES',
    description: 'Walls push you towards the water and keep getting faster. One point per wall.',
    minPlayers: 1,
    maxPlayers: 8,
    settings: [
      { label: 'START SPEED', options: ['NORMAL', 'FAST'] },
      { label: 'GAPS', options: ['WIDE', 'NARROW'] },
    ],
    art: '@assets/cards/obstacles',
  },
  {
    scene: 'hide-and-seek',
    title: 'HIDE AND SEEK',
    description: 'Hide behind the blocks. The seeker throws three balls, then has to guess.',
    minPlayers: 2,
    maxPlayers: 8,
    settings: [
      { label: 'SEEKER', options: ['RANDOM', 'PLAYER 1'] },
      { label: 'HIDING TIME', options: ['15 S', '10 S', '5 S'] },
    ],
    art: '@assets/cards/hide-and-seek',
  },
  {
    scene: 'push-push',
    title: 'PUSH-PUSH',
    description: 'Sumo in a ring: shove whoever stands in front of you. Last one in wins.',
    minPlayers: 2,
    maxPlayers: 8,
    settings: [
      { label: 'RING', options: ['LARGE', 'SMALL'] },
      { label: 'TIME LIMIT', options: ['60 S', '30 S', '90 S'] },
    ],
    art: '@assets/cards/push-push',
  },
] as const satisfies readonly MiniGameInfo[];

/** Scene name of a mini-game. */
export type MiniGameId = (typeof MINI_GAMES)[number]['scene'];

export function miniGame(id: MiniGameId): MiniGameInfo {
  const info = MINI_GAMES.find((game) => game.scene === id);
  if (!info)
    throw new Error(`Unknown mini-game "${id}". Add it to MINI_GAMES in party/catalog.ts.`);
  return info;
}

/** The default choice of both settings. */
export function defaultSettings(id: MiniGameId): MiniGameSettings {
  const [a, b] = miniGame(id).settings;
  return [a.initial ?? 0, b.initial ?? 0];
}

/** `true` when that many players can play the mini-game. */
export function playable(id: MiniGameId, players: number): boolean {
  const info = miniGame(id);
  return players >= info.minPlayers && players <= info.maxPlayers;
}
