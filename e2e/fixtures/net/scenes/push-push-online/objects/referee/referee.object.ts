import { Container, DMath } from '@blacklight/core';
import Wrestler from '../wrestler/wrestler.object';
import { RING, ROUND_BREAK } from '../../rules';

/**
 * Round logic. Scene fields are not part of snapshots, so the match state lives on this object:
 * rollback restores it with everything else.
 */
export default class Referee extends Container {
  /** Player numbers in the match. */
  players: number[] = [];
  round = 0;
  /** Points per player (index = player number − 1). */
  scores: number[] = [];
  /** Step at which the next round starts, or -1 during a round. */
  nextRound = 0;

  override update(): void {
    const steps = this.scene.steps;
    if (this.nextRound >= 0) {
      if (steps >= this.nextRound) this.startRound();
      return;
    }
    const standing = this.scene.findAll<Wrestler>('wrestler');
    if (standing.length <= 1) {
      const winner = standing[0];
      if (winner) this.scores[winner.player - 1] = (this.scores[winner.player - 1] ?? 0) + 1;
      this.nextRound = steps + ROUND_BREAK;
    }
  }

  private startRound(): void {
    for (const wrestler of this.scene.findAll<Wrestler>('wrestler')) wrestler.destroy();
    this.round++;
    this.nextRound = -1;
    const count = this.players.length;
    this.players.forEach((player, i) => {
      // Around the center, with a random offset: the seeded generator is part of the state.
      const angle = (i / count) * DMath.PI * 2 + this.scene.random.float(-0.3, 0.3);
      const distance = RING.radius * 0.55;
      this.scene.spawn(Wrestler, {
        x: RING.x + DMath.cos(angle) * distance,
        y: RING.y + DMath.sin(angle) * distance,
        player,
        facing: angle + DMath.PI,
      });
    });
  }
}
