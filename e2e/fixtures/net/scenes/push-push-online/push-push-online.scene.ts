import { Scene } from '@blacklight/core';
import { rollback, type OnlineMatch, type SceneRollback } from '@blacklight/net';
import { botInput } from './bots';
import Referee from './objects/referee/referee.object';
import Ring from './objects/ring/ring.object';
import { INPUTS } from './rules';

export interface PushPushParams {
  match: OnlineMatch;
  /** Local players are bots (tests). */
  bots?: boolean;
  /** Input delay in steps. @defaultValue `2` */
  delay?: number;
}

/** Push-Push online: the rollback session drives every step of this scene. */
export default class PushPushOnline extends Scene<PushPushParams> {
  net!: SceneRollback;

  override create({ match, bots, delay }: PushPushParams): void {
    // First: seeds the random generator with the match seed before anything uses it.
    this.net = rollback(this, match, {
      inputs: INPUTS,
      delay: delay ?? 2,
      sample: bots ? botInput : undefined,
    });
    this.spawn(Ring);
    const referee = this.spawn(Referee);
    referee.players = match.players.map((p) => p.number);
    referee.scores = referee.players.map(() => 0);
  }
}
