// @blacklight-deterministic
import { DMath } from '@blacklight/core';
import { MiniGame } from '../../party/minigame';
import { PLAY } from '../../party/rules';
import DoorReferee from './objects/door-referee/door-referee.object';
import Jumper from './objects/jumper/jumper.object';
import Storm from './objects/storm/storm.object';
import { FLOOR_Y, LIVES, MIDDLE, STAGES, UPPER } from './rules';

/** 50-50: guess the side the cloud will not strike. */
export default class FiftyFifty extends MiniGame<DoorReferee> {
  protected override setup(): void {
    this.backdrop((pen) => {
      pen.rect(0, 0, PLAY.width, PLAY.height).fill(0x18122b);
      pen
        .rect(UPPER.left, UPPER.top - 40, UPPER.right - UPPER.left, FLOOR_Y - UPPER.top + 40)
        .fill(0x2a2148);
      pen.rect(MIDDLE - 6, UPPER.top - 40, 12, FLOOR_Y - UPPER.top + 20).fill(0xffd60a);
      pen
        .rect(UPPER.left, FLOOR_Y + 20, UPPER.right - UPPER.left, PLAY.height - FLOOR_Y - 60)
        .fill(0x120c20);
      pen.rect(MIDDLE - 10, FLOOR_Y + 20, 20, PLAY.height - FLOOR_Y - 60).fill(0x2a2148);
    });
    const referee = this.spawn(DoorReferee);
    referee.begin(this.contestants.map((c) => c.player));
    const lives = LIVES[this.settings[1]] ?? 2;
    referee.lives = this.contestants.map(() => lives);
    referee.lastStanding = this.settings[0] === 0;
    this.spawn(Storm, { zIndex: 5 });
    this.spawnPlayers(Jumper, (i, count) => {
      // Alternate sides, so idle players do not all share one fate.
      const side = i % 2;
      const perSide = Math.ceil(count / 2);
      const slot = Math.floor(i / 2);
      const width = MIDDLE - UPPER.left - 120;
      const x = (side === 0 ? UPPER.left + 60 : MIDDLE + 60) + ((slot + 0.5) * width) / perSide;
      return { x, y: (UPPER.top + UPPER.bottom) / 2, facing: DMath.PI / 2 };
    });
  }

  override notice(): string | undefined {
    const referee = this.referee;
    if (!referee.playing) return undefined;
    if (referee.stage === 'choose') {
      const left = Math.ceil((STAGES.choose - referee.stageClock) / 60);
      return `ROUND ${referee.round} · PICK A SIDE ${left}`;
    }
    return `ROUND ${referee.round}`;
  }

  override detail(player: number): string | undefined {
    const lives = this.referee.lives[this.referee.index(player)] ?? 0;
    return lives > 0 ? `${lives} ${lives === 1 ? 'LIFE' : 'LIVES'}` : undefined;
  }
}
