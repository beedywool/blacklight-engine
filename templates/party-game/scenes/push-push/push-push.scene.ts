// @blacklight-deterministic
import { DMath } from '@blacklight/core';
import { MiniGame } from '../../party/minigame';
import { PLAY } from '../../party/rules';
import Sumo from './objects/sumo/sumo.object';
import SumoReferee from './objects/sumo-referee/sumo-referee.object';
import { CENTER, RING_RADIUS, TIME_LIMIT } from './rules';

/** Push-Push: the last wrestler in the ring wins. */
export default class PushPush extends MiniGame<SumoReferee> {
  protected override setup(): void {
    const radius = RING_RADIUS[this.settings[0]] ?? RING_RADIUS[0];
    this.backdrop((pen) => {
      pen.rect(0, 0, PLAY.width, PLAY.height).fill(0x1b1420);
      pen.circle(CENTER.x, CENTER.y, radius + 18).fill(0x3a2a1a);
      pen.circle(CENTER.x, CENTER.y, radius).fill(0xe9d8b4);
      pen.circle(CENTER.x, CENTER.y, radius).stroke({ width: 10, color: 0xb2302a });
      pen.rect(CENTER.x - 90, CENTER.y - 40, 12, 80).fill(0x6b4a2a);
      pen.rect(CENTER.x + 78, CENTER.y - 40, 12, 80).fill(0x6b4a2a);
    });
    const referee = this.spawn(SumoReferee);
    referee.ringRadius = radius;
    referee.timeLimit = TIME_LIMIT[this.settings[1]] ?? TIME_LIMIT[0];
    referee.begin(this.contestants.map((c) => c.player));
    this.spawnPlayers(Sumo, (i, count) => {
      // Around the center, facing it, with a small seeded offset.
      const angle = (i / count) * DMath.PI * 2 + this.random.float(-0.2, 0.2);
      return {
        x: CENTER.x + DMath.cos(angle) * radius * 0.6,
        y: CENTER.y + DMath.sin(angle) * radius * 0.6,
        facing: angle + DMath.PI,
      };
    });
  }

  override notice(): string | undefined {
    const referee = this.referee;
    if (!referee.playing) return undefined;
    return `${Math.ceil((referee.timeLimit - referee.clock) / 60)}`;
  }
}
