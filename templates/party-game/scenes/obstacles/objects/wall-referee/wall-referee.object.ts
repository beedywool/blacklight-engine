// @blacklight-deterministic
import Referee from '@objects/referee/referee.object';
import { FIELD, WALL_SPACING, WALL_START_X, WALL_WIDTH, wallSpeed } from '../../rules';
import Wall from '../wall/wall.object';

export default class WallReferee extends Referee {
  startLevel = 0;
  gapHeight = 300;

  protected override rules(): void {
    const speed = wallSpeed(this.clock, this.startLevel) * this.game.time.dt;
    let last = -Infinity;
    for (const wall of this.scene.findAll<Wall>('wall')) {
      wall.x -= speed;
      last = Math.max(last, wall.x);
      if (wall.x < -WALL_WIDTH) wall.destroy();
    }
    if (last < WALL_START_X - WALL_SPACING) {
      const half = this.gapHeight / 2;
      this.scene.spawn(Wall, {
        x: WALL_START_X,
        gapY: this.scene.random.int(FIELD.top + half + 20, FIELD.bottom - half - 20),
        gapHeight: this.gapHeight,
      });
    }
    if (this.standing.length === 0) this.finish();
  }
}
