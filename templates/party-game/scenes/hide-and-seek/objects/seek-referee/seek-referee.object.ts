// @blacklight-deterministic
import Referee from '@objects/referee/referee.object';
import { SECOND } from '../../../../party/rules';
import { FIND_POINTS, GUESS_TIME, HIDDEN_BONUS, THROW_TIME, type Stage } from '../../rules';

export default class SeekReferee extends Referee {
  /** Player number of the seeker. */
  seeker = 0;
  stage: Stage = 'hide';
  /** Steps since the stage started. */
  stageClock = 0;
  hideTime = 0;
  balls = 0;
  guesses = 0;
  /** A ball is in the air. */
  throwing = false;

  override canUseCard(player: number): boolean {
    return player !== this.seeker;
  }

  /** Hiders not found yet. */
  get hiding(): number[] {
    return this.standing.filter((p) => p !== this.seeker);
  }

  get stageLength(): number {
    return this.stage === 'hide' ? this.hideTime : this.stage === 'throw' ? THROW_TIME : GUESS_TIME;
  }

  protected override rules(): void {
    this.stageClock++;
    if (this.stage !== 'hide' && this.stageClock % SECOND === 0) {
      for (const player of this.hiding) this.score(player, 1);
    }
    switch (this.stage) {
      case 'hide':
        if (this.stageClock >= this.hideTime) this.next('throw');
        break;
      case 'throw':
        if ((this.balls === 0 && !this.throwing) || this.stageClock >= THROW_TIME)
          this.next('guess');
        break;
      case 'guess':
        if (this.guesses <= 0 || this.hiding.length === 0 || this.stageClock >= GUESS_TIME) {
          for (const player of this.hiding) this.score(player, HIDDEN_BONUS);
          this.finish();
        }
        break;
    }
  }

  private next(stage: Stage): void {
    this.stage = stage;
    this.stageClock = 0;
    this.scene.audio.play('go');
  }

  /** The seeker found a hider. */
  found(player: number): void {
    this.knockOut(player);
    this.score(this.seeker, FIND_POINTS);
    this.scene.audio.play('found');
  }
}
