// The party in progress, shared by the scenes and their screens: who plays, which profile each
// player uses, the points of the last match and of the whole party. Local profiles (name, wins,
// points) are kept in the game settings.
import type { Game } from '@blacklight/core';
import type { OnlineMatch } from '@blacklight/net';
import type { MiniGameId, MiniGameSettings } from './catalog';
import type { Contestant } from './minigame';

/** Who a player plays as. */
export type Identity =
  | { kind: 'guest' }
  | { kind: 'profile'; name: string }
  /** The BlackLight account signed in on this device. */
  | { kind: 'account'; name: string };

export interface PartyMember extends Contestant {
  identity: Identity;
}

/** What the match shell plays. */
export interface MatchSetup {
  game: MiniGameId;
  settings: MiniGameSettings;
  /** Online match: players come from the relay, not from the join screen. */
  online?: OnlineMatch;
}

/** A finished match. */
export interface MatchOutcome {
  setup: MatchSetup;
  contestants: Contestant[];
  /** Points by player number. */
  scores: Map<number, number>;
}

export interface Profile {
  name: string;
  wins: number;
  points: number;
}

/** The party of this session (module state: it lives as long as the page). */
export const party = {
  members: [] as PartyMember[],
  /** Points of the whole party by player number. */
  totals: new Map<number, number>(),
  last: undefined as MatchOutcome | undefined,
  /** Settings chosen last for each mini-game. */
  settings: {} as Partial<Record<MiniGameId, MiniGameSettings>>,
  /** Mini-game chosen last. */
  game: undefined as MiniGameId | undefined,
};

const PROFILES = 'party.profiles';

export function profiles(game: Game): Profile[] {
  return game.settings.get<Profile[]>(PROFILES) ?? [];
}

export function addProfile(game: Game, name: string): Profile {
  const list = profiles(game);
  const existing = list.find((p) => p.name === name);
  if (existing) return existing;
  const profile = { name, wins: 0, points: 0 };
  game.settings.set(PROFILES, [...list, profile]);
  return profile;
}

/** Name shown for a player. */
export function displayName(member: { player: number; identity: Identity }): string {
  return member.identity.kind === 'guest' ? `GUEST ${member.player}` : member.identity.name;
}

/** Starts a new party with these members (from the join screen). */
export function startParty(members: PartyMember[]): void {
  party.members = members.map((m) => ({ ...m, name: displayName(m) }));
  party.totals = new Map(members.map((m) => [m.player, 0]));
  party.last = undefined;
}

/** Players of a match: the party offline, the relay's players online. */
export function contestantsOf(setup: MatchSetup): Contestant[] {
  if (setup.online) {
    return setup.online.players.map((p) => ({
      player: p.number,
      skin: (p.number - 1) % 8,
      name: p.name.toUpperCase(),
    }));
  }
  return party.members.map(({ player, skin, name }) => ({ player, skin, name }));
}

/** Players sorted by points, best first. Ties share a rank. */
export function ranking(
  outcome: MatchOutcome,
): { contestant: Contestant; points: number; rank: number }[] {
  const rows = outcome.contestants
    .map((contestant) => ({ contestant, points: outcome.scores.get(contestant.player) ?? 0 }))
    .sort((a, b) => b.points - a.points || a.contestant.player - b.contestant.player);
  return rows.map((row) => ({
    ...row,
    rank: rows.findIndex((other) => other.points === row.points) + 1,
  }));
}

/** Adds a finished match to the party totals and to the local profiles of its players. */
export function recordMatch(game: Game, outcome: MatchOutcome): void {
  party.last = outcome;
  if (outcome.setup.online) return;
  for (const [player, points] of outcome.scores)
    party.totals.set(player, (party.totals.get(player) ?? 0) + points);
  const winners = new Set(
    ranking(outcome)
      .filter((row) => row.rank === 1 && row.points > 0)
      .map((row) => row.contestant.player),
  );
  const list = profiles(game);
  let changed = false;
  for (const member of party.members) {
    if (member.identity.kind !== 'profile') continue;
    const profile = list.find((p) => p.name === (member.identity as { name: string }).name);
    if (!profile) continue;
    profile.points += outcome.scores.get(member.player) ?? 0;
    if (winners.has(member.player)) profile.wins++;
    changed = true;
  }
  if (changed) game.settings.set(PROFILES, list);
}
