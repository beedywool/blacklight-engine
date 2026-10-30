// @blacklight-deterministic
import { DMath, Graphics } from '@blacklight/core';
import Referee from '@objects/referee/referee.object';
import { length } from '../../../../party/geometry';
import {
  BOARD_SPIN,
  FACE_OFF_AFTER,
  GOAL,
  KICK,
  MIDDLE,
  MIN_ACROSS,
  PUCK_FRICTION,
  PUCK_MAX_SPEED,
  PUCK_MIN_SPEED,
  PUCK_RADIUS,
  RINK,
  SERVE_DELAY,
  SERVE_SPEED,
} from '../../rules';
import type Mallet from '../mallet/mallet.object';
import type RinkReferee from '../rink-referee/rink-referee.object';

/** The puck: slides, bounces off the boards and the mallets, scores in the goal mouths. */
export default class Puck extends Graphics {
  static override hitbox = 'none' as const;

  vx = 0;
  vy = 0;
  /** Steps until the next serve, or -1 while in play. */
  serveIn = 0;
  /** Team the next serve goes towards (0 left, 1 right). */
  serveTo = 0;
  /** Steps since the last serve; parked mallets can trap the puck in a loop without goals. */
  inPlay = 0;

  override create(): void {
    this.paint();
  }

  override onRestore(): void {
    this.paint();
  }

  private paint(): void {
    this.draw.clear();
    this.draw.circle(0, 0, PUCK_RADIUS).fill(0x111111).stroke({ width: 4, color: 0xffd60a });
    this.draw.circle(0, 0, PUCK_RADIUS * 0.45).fill(0xffd60a);
  }

  override update(): void {
    const referee = this.scene.find(Referee) as RinkReferee;
    if (!referee.playing) return;
    const dt = this.game.time.dt;
    if (this.serveIn >= 0) {
      if (this.serveIn-- > 0) return;
      const angle = (this.serveTo === 0 ? DMath.PI : 0) + this.scene.random.float(-0.55, 0.55);
      this.vx = DMath.cos(angle) * SERVE_SPEED;
      this.vy = DMath.sin(angle) * SERVE_SPEED;
      this.inPlay = 0;
    }
    if (++this.inPlay > FACE_OFF_AFTER) return this.faceOff(this.serveTo);
    this.vx *= PUCK_FRICTION;
    this.vy *= PUCK_FRICTION;
    this.limit(PUCK_MIN_SPEED, PUCK_MAX_SPEED);
    this.x += this.vx * dt;
    this.y += this.vy * dt;
    const r = PUCK_RADIUS;
    if (this.y < RINK.top + r) {
      this.y = RINK.top + r;
      this.vy = Math.abs(this.vy);
      this.board();
    }
    if (this.y > RINK.bottom - r) {
      this.y = RINK.bottom - r;
      this.vy = -Math.abs(this.vy);
      this.board();
    }
    const inMouth = this.y > GOAL.top + r && this.y < GOAL.bottom - r;
    if (inMouth && this.x < RINK.left - r) return this.scored(referee, 1);
    if (inMouth && this.x > RINK.right + r) return this.scored(referee, 0);
    if (!inMouth && this.x < RINK.left + r) {
      this.x = RINK.left + r;
      this.vx = Math.abs(this.vx);
      this.board();
    }
    if (!inMouth && this.x > RINK.right - r) {
      this.x = RINK.right - r;
      this.vx = -Math.abs(this.vx);
      this.board();
    }
    for (const mallet of this.scene.findAll<Mallet>('mallet')) this.strike(mallet);
  }

  private strike(mallet: Mallet): void {
    const dx = this.x - mallet.x;
    const dy = this.y - mallet.y;
    const d = length(dx, dy);
    const reach = mallet.radius + PUCK_RADIUS;
    if (d >= reach || d === 0) return;
    const nx = dx / d;
    const ny = dy / d;
    this.x = mallet.x + nx * reach;
    this.y = mallet.y + ny * reach;
    // Bounce in the mallet's frame, then add the mallet's speed and a kick along the normal.
    const rx = this.vx - mallet.vx;
    const ry = this.vy - mallet.vy;
    const dot = rx * nx + ry * ny;
    let vx = mallet.vx + (dot < 0 ? rx - 2 * dot * nx : rx);
    let vy = mallet.vy + (dot < 0 ? ry - 2 * dot * ny : ry);
    const out = vx * nx + vy * ny;
    if (out < KICK) {
      vx += nx * (KICK - out);
      vy += ny * (KICK - out);
    }
    this.vx = vx;
    this.vy = vy;
    this.limit(PUCK_MIN_SPEED, PUCK_MAX_SPEED);
    this.scene.audio.play('hit');
  }

  /** Turns the puck a little after a board bounce (seeded, the same on every machine). */
  private board(): void {
    const turn = this.scene.random.float(-BOARD_SPIN, BOARD_SPIN);
    const cos = DMath.cos(turn);
    const sin = DMath.sin(turn);
    const vx = this.vx * cos - this.vy * sin;
    this.vy = this.vx * sin + this.vy * cos;
    this.vx = vx;
  }

  private limit(min: number, max: number): void {
    const speed = length(this.vx, this.vy);
    if (speed === 0) return;
    const target = speed < min ? min : speed > max ? max : speed;
    this.vx = (this.vx / speed) * target;
    this.vy = (this.vy / speed) * target;
    const across = target * MIN_ACROSS;
    if (Math.abs(this.vx) < across) {
      this.vx = this.vx < 0 ? -across : across;
      this.vy = (this.vy < 0 ? -1 : 1) * Math.sqrt(target * target - across * across);
    }
  }

  private scored(referee: RinkReferee, team: number): void {
    referee.goal(team);
    this.faceOff(team);
  }

  /** Puts the puck back at the center; it is served towards `1 - team`. */
  private faceOff(team: number): void {
    this.x = MIDDLE;
    this.y = (RINK.top + RINK.bottom) / 2;
    this.vx = 0;
    this.vy = 0;
    this.serveIn = SERVE_DELAY;
    this.serveTo = 1 - team;
  }
}
