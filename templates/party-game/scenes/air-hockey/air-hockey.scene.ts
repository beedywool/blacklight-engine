// @blacklight-deterministic
import { DMath } from '@blacklight/core';
import { MiniGame } from '../../party/minigame';
import { PLAY } from '../../party/rules';
import Mallet from './objects/mallet/mallet.object';
import Puck from './objects/puck/puck.object';
import RinkReferee from './objects/rink-referee/rink-referee.object';
import { GOAL, GOALS_TO_WIN, MIDDLE, RINK, teams } from './rules';

const TEAM_COLORS = [0xe60012, 0x2f7cf6];

/** Air Hockey: left team against right team. */
export default class AirHockey extends MiniGame<RinkReferee> {
  protected override setup(): void {
    this.backdrop((pen) => {
      pen.rect(0, 0, PLAY.width, PLAY.height).fill(0x0d1a26);
      pen
        .roundRect(RINK.left, RINK.top, RINK.right - RINK.left, RINK.bottom - RINK.top, 60)
        .fill(0xe8f1f7)
        .stroke({ width: 8, color: 0x8fa3b3 });
      pen.rect(MIDDLE - 4, RINK.top, 8, RINK.bottom - RINK.top).fill(0xb8c7d3);
      pen.circle(MIDDLE, PLAY.height / 2, 110).stroke({ width: 8, color: 0xb8c7d3 });
      pen.rect(0, GOAL.top, RINK.left, GOAL.bottom - GOAL.top).fill(TEAM_COLORS[0]!);
      pen
        .rect(RINK.right, GOAL.top, PLAY.width - RINK.right, GOAL.bottom - GOAL.top)
        .fill(TEAM_COLORS[1]!);
    });
    const referee = this.spawn(RinkReferee);
    referee.begin(this.contestants.map((c) => c.player));
    referee.teams = teams(this.contestants.length, this.settings[0]);
    referee.target = GOALS_TO_WIN[this.settings[1]] ?? GOALS_TO_WIN[1];
    const placed = [0, 0];
    const sizes = [0, 1].map((t) => referee.teams.filter((team) => team === t).length);
    this.spawnPlayers(Mallet, (i) => {
      const team = referee.teams[i]!;
      const slot = placed[team]!++;
      const y = RINK.top + ((slot + 1) * (RINK.bottom - RINK.top)) / (sizes[team]! + 1);
      const x =
        team === 0 ? RINK.left + 180 + (slot % 2) * 160 : RINK.right - 180 - (slot % 2) * 160;
      return { x, y, facing: team === 0 ? 0 : DMath.PI };
    });
    this.spawn(Puck, {
      x: MIDDLE,
      y: PLAY.height / 2,
      serveIn: 30,
      serveTo: this.random.int(0, 1),
    });
  }

  override notice(): string | undefined {
    const [left, right] = this.referee.goals;
    return this.referee.phase === 'intro' ? undefined : `${left} - ${right}`;
  }

  override detail(player: number): string | undefined {
    return this.referee.teamOf(player) === 0 ? 'LEFT TEAM' : 'RIGHT TEAM';
  }
}
