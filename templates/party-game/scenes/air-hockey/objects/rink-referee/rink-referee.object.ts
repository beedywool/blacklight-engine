// @blacklight-deterministic
import Referee from '@objects/referee/referee.object';
import { WIN_BONUS } from '../../rules';

export default class RinkReferee extends Referee {
  /** Team of each player (0 left, 1 right), by index. */
  teams: number[] = [];
  /** Goals of the left and right teams. */
  goals = [0, 0];
  target = 5;

  /** A team scored: its players get a point; reaching the target ends the game. */
  goal(team: number): void {
    this.goals[team]!++;
    this.players.forEach((player, i) => {
      if (this.teams[i] === team) this.score(player, 1);
    });
    this.scene.audio.play('goal');
    if (this.goals[team]! >= this.target) {
      this.players.forEach((player, i) => {
        if (this.teams[i] === team) this.score(player, WIN_BONUS);
      });
      this.finish();
    }
  }

  teamOf(player: number): number {
    return this.teams[this.index(player)] ?? 0;
  }
}
