// @blacklight-deterministic
import Referee from '@objects/referee/referee.object';
import type { Rect } from '@blacklight/core';
import { LIVES } from '../../rules';

export default class SurvivalReferee extends Referee {
  /** Obstacles of the chosen arena. */
  pillars: Rect[] = [];
  /** Hits taken, by player index. */
  hits: number[] = [];

  override begin(players: number[]): void {
    super.begin(players);
    this.hits = players.map(() => 0);
  }

  lives(player: number): number {
    return LIVES - (this.hits[this.index(player)] ?? 0);
  }

  protected override rules(): void {
    if (this.secondElapsed) this.scoreStanding(1);
    if (this.standing.length === 0) this.finish();
  }
}
