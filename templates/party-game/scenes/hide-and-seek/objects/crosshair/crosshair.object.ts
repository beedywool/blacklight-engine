// @blacklight-deterministic
import { Graphics } from '@blacklight/core';
import Referee from '@objects/referee/referee.object';
import { clamp, direction, inside, length } from '../../../../party/geometry';
import { CROSSHAIR_SPEED, FIELD, GUESS_RADIUS, SEEKER_SPOT } from '../../rules';
import Ball from '../ball/ball.object';
import type Block from '../block/block.object';
import type Hider from '../hider/hider.object';
import type SeekReferee from '../seek-referee/seek-referee.object';

/**
 * The seeker's aim, moved with the directions; `action` or `confirm` throws (throw stage) or
 * guesses (guess stage). Offline, a click or tap aims and acts at once.
 */
export default class Crosshair extends Graphics {
  static override hitbox = 'none' as const;
  #drawn = '';

  refresh(): void {
    const referee = this.scene.find(Referee) as SeekReferee | undefined;
    const active = !!referee && referee.playing && referee.stage !== 'hide';
    const blocked = active && this.overBlock();
    const key = `${active}:${blocked}`;
    if (key === this.#drawn) return;
    this.#drawn = key;
    this.draw.clear();
    if (!active) return;
    const color = blocked ? 0x888888 : 0xffd60a;
    this.draw.circle(0, 0, GUESS_RADIUS).stroke({ width: 6, color: 0x111111 });
    this.draw.circle(0, 0, GUESS_RADIUS).stroke({ width: 3, color });
    for (const [x, y] of [
      [0, -1],
      [0, 1],
      [-1, 0],
      [1, 0],
    ] as const) {
      this.draw
        .rect(x * 30 - 3 + (y !== 0 ? 0 : x * 10), y * 30 - 3 + (x !== 0 ? 0 : y * 10), 6, 6)
        .fill(color);
    }
  }

  /** The crosshair is over a block: no guessing through blocks. */
  overBlock(): boolean {
    return this.scene.findAll<Block>('block').some((b) => inside(this.x, this.y, b.rect));
  }

  override update(): void {
    const referee = this.scene.find(Referee) as SeekReferee;
    if (!referee.playing || referee.stage === 'hide') return;
    const input = this.game.input.player(referee.seeker);
    const move = direction(input);
    const dt = this.game.time.dt;
    this.x = clamp(this.x + move.x * CROSSHAIR_SPEED * dt, FIELD.left, FIELD.right);
    this.y = clamp(this.y + move.y * CROSSHAIR_SPEED * dt, FIELD.top, FIELD.bottom);
    let act = input.pressed('action') || input.pressed('confirm');
    // The pointer is not part of the online input: offline only.
    const online = (this.scene as { net?: unknown }).net !== undefined;
    const pointer = this.scene.pointer;
    if (!online && pointer.pressed) {
      this.x = clamp(pointer.x, FIELD.left, FIELD.right);
      this.y = clamp(pointer.y, FIELD.top, FIELD.bottom);
      act = true;
    }
    if (!act) return;
    if (referee.stage === 'throw') this.throw(referee);
    else this.guess(referee);
  }

  private throw(referee: SeekReferee): void {
    if (referee.balls <= 0 || referee.throwing) return;
    referee.balls--;
    referee.throwing = true;
    this.scene.spawn(Ball, {
      x: SEEKER_SPOT.x,
      y: SEEKER_SPOT.y,
      fromX: SEEKER_SPOT.x,
      fromY: SEEKER_SPOT.y,
      toX: this.x,
      toY: this.y,
      zIndex: 8,
    });
    this.scene.audio.play('throw');
  }

  private guess(referee: SeekReferee): void {
    if (referee.guesses <= 0) return;
    if (this.overBlock()) {
      this.scene.audio.play('miss');
      return;
    }
    referee.guesses--;
    const hider = this.scene
      .findAll<Hider>('hider')
      .find(
        (h) => !h.shielded && length(h.x - this.x, h.y - this.y) <= GUESS_RADIUS + h.radius / 2,
      );
    if (!hider) {
      this.scene.audio.play('miss');
      return;
    }
    referee.found(hider.player);
    hider.destroy();
  }
}
