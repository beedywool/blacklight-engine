// @blacklight-deterministic
import Referee from '@objects/referee/referee.object';
import Avatar from '@objects/avatar/avatar.object';
import {
  LAST_STANDING_BONUS,
  MAX_ROUNDS,
  STAGES,
  nextStage,
  sideOf,
  type Stage,
} from '../../rules';

export default class DoorReferee extends Referee {
  stage: Stage = 'choose';
  /** Steps since the stage started. */
  stageClock = 0;
  round = 1;
  /** Side the cloud strikes this round (0 left, 1 right), -1 before the drop. */
  strikeSide = -1;
  /** Lives left, by player index. */
  lives: number[] = [];
  /** Last one standing wins (otherwise everybody plays until out). */
  lastStanding = true;

  protected override rules(): void {
    if (++this.stageClock < STAGES[this.stage]) return;
    this.stageClock = 0;
    this.stage = nextStage(this.stage);
    if (this.stage === 'drop') this.strikeSide = this.scene.random.int(0, 1);
    if (this.stage === 'strike') this.strike();
    if (this.stage === 'choose') this.endRound();
  }

  private strike(): void {
    this.scene.audio.play('thunder');
    for (const avatar of this.scene.findAll<Avatar>(Avatar)) {
      if (sideOf(avatar.x) !== this.strikeSide || avatar.shielded) continue;
      const i = this.index(avatar.player);
      avatar.blink = STAGES.strike;
      if (--this.lives[i]! <= 0) {
        this.knockOut(avatar.player);
        avatar.destroy();
      }
    }
  }

  private endRound(): void {
    this.strikeSide = -1;
    const standing = this.standing;
    this.scoreStanding(1);
    if (this.lastStanding && this.players.length > 1 && standing.length <= 1) {
      if (standing[0] !== undefined) this.score(standing[0], LAST_STANDING_BONUS);
      this.finish();
    } else if (standing.length === 0 || this.round >= MAX_ROUNDS) {
      this.finish();
    } else {
      this.round++;
    }
  }
}
