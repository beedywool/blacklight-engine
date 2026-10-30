// @blacklight-deterministic
import { DMath, Graphics } from '@blacklight/core';
import Referee from '@objects/referee/referee.object';
import { circleRect, length, reflect } from '../../../../party/geometry';
import { PLAY } from '../../../../party/rules';
import { BORDER, ENEMY_RADIUS, enemySpeed } from '../../rules';
import type SurvivalReferee from '../survival-referee/survival-referee.object';

/** A spiked ball bouncing off the walls and pillars, faster every five seconds. */
export default class Enemy extends Graphics {
  static override hitbox = 'none' as const;
  static override tags = ['enemy'];

  radius = ENEMY_RADIUS;
  /** Direction of travel, unit vector. */
  dx = 0;
  dy = -1;

  override create(): void {
    this.paint();
  }

  override onRestore(): void {
    this.paint();
  }

  private paint(): void {
    const r = this.radius;
    this.draw.clear();
    for (let i = 0; i < 10; i++) {
      const a = (i / 10) * DMath.PI * 2;
      const b = a + DMath.PI / 10;
      this.draw
        .poly([
          DMath.cos(a - 0.2) * r * 0.8,
          DMath.sin(a - 0.2) * r * 0.8,
          DMath.cos(b) * r * 1.3,
          DMath.sin(b) * r * 1.3,
          DMath.cos(a + 0.6) * r * 0.8,
          DMath.sin(a + 0.6) * r * 0.8,
        ])
        .fill(0x2b2b2b);
    }
    this.draw.circle(0, 0, r).fill(0x8a0f2d).stroke({ width: 4, color: 0x111111 });
    this.draw.circle(-r * 0.35, -r * 0.15, r * 0.2).fill(0xffd60a);
    this.draw.circle(r * 0.35, -r * 0.15, r * 0.2).fill(0xffd60a);
  }

  override update(): void {
    const referee = this.scene.find(Referee) as SurvivalReferee;
    if (!referee.playing) return;
    const speed = enemySpeed(referee.clock) * this.game.time.dt;
    this.x += this.dx * speed;
    this.y += this.dy * speed;
    const r = this.radius;
    if (this.x < BORDER + r) this.bounce(BORDER + r - this.x, 0, 1, 0);
    if (this.x > PLAY.width - BORDER - r) this.bounce(PLAY.width - BORDER - r - this.x, 0, -1, 0);
    if (this.y < BORDER + r) this.bounce(0, BORDER + r - this.y, 0, 1);
    if (this.y > PLAY.height - BORDER - r) this.bounce(0, PLAY.height - BORDER - r - this.y, 0, -1);
    for (const pillar of referee.pillars) {
      const hit = circleRect(this.x, this.y, r, pillar);
      if (hit) this.bounce(hit.x, hit.y, hit.nx, hit.ny);
    }
    this.rotation += 0.05;
  }

  /** Moves out by (px, py) and reflects the direction on the normal (nx, ny). */
  bounce(px: number, py: number, nx: number, ny: number): void {
    this.x += px;
    this.y += py;
    const d = reflect(this.dx, this.dy, nx, ny);
    const size = length(d.x, d.y);
    this.dx = d.x / size;
    this.dy = d.y / size;
  }
}
