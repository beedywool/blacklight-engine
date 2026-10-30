// @blacklight-deterministic
import { DMath } from '@blacklight/core';
import Avatar from '@objects/avatar/avatar.object';
import { MiniGame } from '../../party/minigame';
import { PLAY } from '../../party/rules';
import Block from './objects/block/block.object';
import Crosshair from './objects/crosshair/crosshair.object';
import Hider from './objects/hider/hider.object';
import SeekReferee from './objects/seek-referee/seek-referee.object';
import { BALLS, BLOCKS, FIELD, HIDING_TIME, SEEKER_SPOT } from './rules';

/** Hide and Seek: one seeker, everybody else hides. */
export default class HideAndSeek extends MiniGame<SeekReferee> {
  protected override setup(): void {
    this.backdrop((pen) => {
      pen.rect(0, 0, PLAY.width, PLAY.height).fill(0x2e5a3a);
      pen
        .rect(FIELD.left, FIELD.top, FIELD.right - FIELD.left, FIELD.bottom - FIELD.top)
        .fill(0x3f7a4c);
      for (let x = FIELD.left; x < FIELD.right; x += 100)
        pen.rect(x, FIELD.top, 50, FIELD.bottom - FIELD.top).fill({ color: 0x000000, alpha: 0.05 });
      pen.rect(0, FIELD.bottom, PLAY.width, PLAY.height - FIELD.bottom).fill(0x1d3a25);
    });
    const referee = this.spawn(SeekReferee);
    const players = this.contestants.map((c) => c.player);
    referee.begin(players);
    // Drawn from the seeded generator: the same seeker on every machine.
    referee.seeker =
      this.settings[0] === 1 ? players[0]! : players[this.random.int(0, players.length - 1)]!;
    referee.hideTime = HIDING_TIME[this.settings[1]] ?? HIDING_TIME[0];
    referee.balls = BALLS;
    referee.guesses = Math.max(1, players.length - 1);
    referee.cards[referee.index(referee.seeker)] = false;
    const hiders = this.contestants.filter((c) => c.player !== referee.seeker);
    hiders.forEach((c, i) => {
      this.spawn(Hider, {
        x: FIELD.left + ((i + 1) * (FIELD.right - FIELD.left)) / (hiders.length + 1),
        y: FIELD.bottom - 80,
        player: c.player,
        skin: c.skin,
        facing: -DMath.PI / 2,
      });
    });
    const seeker = this.contestants.find((c) => c.player === referee.seeker)!;
    this.spawn(Avatar, {
      x: SEEKER_SPOT.x,
      y: SEEKER_SPOT.y,
      player: seeker.player,
      skin: seeker.skin,
      facing: -DMath.PI / 2,
      zIndex: 6,
    });
    for (const block of BLOCKS) {
      this.spawn(Block, {
        x: block.x,
        y: block.y,
        blockWidth: block.width,
        blockHeight: block.height,
        color: block.color,
        zIndex: 5,
      });
    }
    this.spawn(Crosshair, { x: PLAY.width / 2, y: 450, player: seeker.player, zIndex: 10 });
  }

  override notice(): string | undefined {
    const referee = this.referee;
    if (!referee.playing) return undefined;
    const left = Math.ceil((referee.stageLength - referee.stageClock) / 60);
    const seeker = this.contestants.find((c) => c.player === referee.seeker)?.name ?? '';
    switch (referee.stage) {
      case 'hide':
        return `HIDE! ${seeker}, LOOK AWAY · ${left}`;
      case 'throw':
        return `${seeker}: THROW · ${referee.balls} ${referee.balls === 1 ? 'BALL' : 'BALLS'} · ${left}`;
      case 'guess':
        return `${seeker}: GUESS · ${referee.guesses} LEFT · ${left}`;
    }
  }

  override detail(player: number): string | undefined {
    const referee = this.referee;
    if (player === referee.seeker) return 'SEEKER';
    return referee.isOut(player) ? 'FOUND' : 'HIDING';
  }
}
