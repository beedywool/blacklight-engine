// @blacklight-deterministic
import { Graphics } from '@blacklight/core';
import Referee from '@objects/referee/referee.object';
import { inside } from '../../../../party/geometry';
import { BALL_FLIGHT } from '../../rules';
import type Block from '../block/block.object';
import type SeekReferee from '../seek-referee/seek-referee.object';

/** A ball thrown by the seeker: lands on its target and knocks away the block there. */
export default class Ball extends Graphics {
  static override hitbox = 'none' as const;

  fromX = 0;
  fromY = 0;
  toX = 0;
  toY = 0;
  /** Steps in the air. */
  flight = 0;

  override create(): void {
    this.paint();
  }

  override onRestore(): void {
    this.paint();
  }

  private paint(): void {
    this.draw.clear();
    this.draw.circle(0, 0, 22).fill(0xffffff).stroke({ width: 4, color: 0x111111 });
    this.draw.rect(-22, -3, 44, 6).fill(0xe60012);
  }

  override update(): void {
    const t = ++this.flight / BALL_FLIGHT;
    // A straight line with a bump: the ball arcs over the blocks.
    this.x = this.fromX + (this.toX - this.fromX) * t;
    this.y = this.fromY + (this.toY - this.fromY) * t - 240 * t * (1 - t);
    this.scale.set(1 + 0.6 * t * (1 - t) * 4);
    if (this.flight < BALL_FLIGHT) return;
    const referee = this.scene.find(Referee) as SeekReferee;
    referee.throwing = false;
    const block = this.scene
      .findAll<Block>('block')
      .find((b) => inside(this.toX, this.toY, b.rect));
    block?.destroy();
    this.scene.audio.play(block ? 'hit' : 'miss');
    this.destroy();
  }
}
