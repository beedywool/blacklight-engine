// @blacklight-deterministic
import { Graphics, Scene, type GameObject } from '@blacklight/core';
import { rollback, type OnlineMatch, type SceneRollback } from '@blacklight/net';
import Avatar from '@objects/avatar/avatar.object';
import Referee from '@objects/referee/referee.object';
import { miniGame, type MiniGameId, type MiniGameSettings } from './catalog';
import { PARTY_INPUTS } from './inputs';
import { PLAY } from './rules';

/** A player taking part in a mini-game. */
export interface Contestant {
  /** Input player number: local player online, match player number online. */
  player: number;
  skin: number;
  name: string;
}

/** What the match shell (or a test) gives a mini-game. */
export interface MiniGameParams {
  players: Contestant[];
  settings: MiniGameSettings;
  /** Plays the mini-game online: every step goes through a rollback session. */
  online?: OnlineMatch;
  /** Online input delay in steps. @defaultValue `2` */
  delay?: number;
}

/** One line of the match shell's player banner. */
export interface ContestantStatus {
  score: number;
  out: boolean;
  card: boolean;
  shield: boolean;
  /** Mini-game specific: lives, team, role. */
  detail?: string;
}

/**
 * Base of the six mini-games: the title banner and "GO!" (controls locked until then), power
 * cards, skins and the online variant. A mini-game spawns its referee (a {@link Referee}
 * subclass that holds its state) and its players in `setup()`.
 *
 * The same code runs offline and online: with `online`, `rollback()` drives every step, and the
 * determinism lint rule checks these files (`@blacklight-deterministic`).
 */
export abstract class MiniGame<R extends Referee = Referee> extends Scene<MiniGameParams> {
  static override size = { width: PLAY.width, height: PLAY.height };
  static override assets = ['@assets/sfx/'];

  net: SceneRollback | undefined;
  contestants: Contestant[] = [];
  settings: MiniGameSettings = [0, 0];

  override create(params: MiniGameParams): void {
    this.contestants = params.players.map((c) => ({ ...c }));
    this.settings = [...params.settings];
    // First: rollback seeds the random generator with the match seed.
    if (params.online) {
      this.net = rollback(this as Scene<never>, params.online, {
        inputs: PARTY_INPUTS,
        delay: params.delay ?? 2,
      });
    }
    this.setup();
    if (this.game.ui) this.ui.open('MiniGameBanner', { scene: this }, { enter: 'fade' });
  }

  /** Spawns the arena, the referee and the players. */
  protected abstract setup(): void;

  get info() {
    return miniGame(this.name as MiniGameId);
  }

  get referee(): R {
    return this.find(Referee) as R;
  }

  /** Spawns the referee and one avatar per contestant at the given places. */
  protected spawnPlayers<A extends Avatar>(
    Type: new () => A,
    place: (index: number, count: number) => { x: number; y: number; facing?: number },
  ): A[] {
    return this.contestants.map((c, i) => {
      const at = place(i, this.contestants.length);
      return this.spawn(Type, {
        x: at.x,
        y: at.y,
        player: c.player,
        skin: c.skin,
        facing: at.facing ?? 0,
      } as never);
    });
  }

  /** Avatar of a player, `undefined` once destroyed. */
  avatarOf<A extends Avatar = Avatar>(player: number): A | undefined {
    return (this.findAll(Avatar) as A[]).find((a) => a.player === player);
  }

  /** Text under the banner during play: countdowns, whose turn it is. */
  notice(): string | undefined {
    return undefined;
  }

  /** Extra line on a player's banner (lives, team…). */
  detail(_player: number): string | undefined {
    return undefined;
  }

  status(player: number): ContestantStatus {
    const referee = this.referee;
    const i = referee.index(player);
    return {
      score: referee.scores[i] ?? 0,
      out: referee.out[i] ?? false,
      card: referee.cards[i] ?? false,
      shield: (referee.shields[i] ?? 0) > 0,
      detail: this.detail(player),
    };
  }

  /** Final points by player number. */
  results(): Map<number, number> {
    const referee = this.referee;
    return new Map(referee.players.map((p, i) => [p, referee.scores[i] ?? 0]));
  }

  override render(): void {
    for (const object of this.objects) if (hasRefresh(object)) object.refresh();
  }

  /** A display-only shape (floor, walls). Repainted after a rollback restore re-creates it. */
  protected backdrop(paint: (pen: Graphics['draw']) => void, zIndex = -10): Graphics {
    const shape = this.spawn(Backdrop, { zIndex });
    shape.paint = paint;
    paint(shape.draw);
    return shape;
  }
}

function hasRefresh(object: GameObject): object is GameObject & { refresh(): void } {
  return typeof (object as { refresh?: unknown }).refresh === 'function';
}

/** Static art of a mini-game, outside the simulation state. */
class Backdrop extends Graphics {
  static override hitbox = 'none' as const;
  static override serialize: string[] = [];
  paint: ((pen: Graphics['draw']) => void) | undefined;
}
