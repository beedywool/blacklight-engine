// @blacklight-deterministic
import Referee from '@objects/referee/referee.object';
import { LAST_STANDING_BONUS } from '../../rules';

export default class SumoReferee extends Referee {
  ringRadius = 0;
  timeLimit = 0;

  protected override rules(): void {
    if (this.secondElapsed) this.scoreStanding(1);
    const standing = this.standing;
    if (this.players.length > 1 && standing.length <= 1) {
      if (standing[0] !== undefined) this.score(standing[0], LAST_STANDING_BONUS);
      this.finish();
    } else if (standing.length === 0 || this.clock >= this.timeLimit) {
      this.finish();
    }
  }
}
