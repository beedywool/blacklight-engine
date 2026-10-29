import { Graphics } from '@blacklight/core';

/** A paper lantern bobbing over the title screen; the title screen labels it and counts clicks. */
export default class Lantern extends Graphics {
  private baseY = 0;
  private time = 0;

  override create() {
    this.baseY = this.y;
    this.draw
      .rect(-4, -120, 8, 60)
      .fill(0x222222)
      .roundRect(-56, -64, 112, 150, 40)
      .fill(0xe60012)
      .roundRect(-40, -50, 80, 122, 30)
      .fill(0xff4d4d)
      .rect(-60, -70, 120, 12)
      .fill(0x111111)
      .rect(-60, 84, 120, 12)
      .fill(0x111111);
  }

  override update() {
    this.time += this.game.time.dt;
    this.y = this.baseY + Math.sin(this.time * 1.6) * 18;
    this.rotation = Math.sin(this.time * 1.1) * 0.05;
  }

  /** `true` when a world point is on the lantern. */
  contains(x: number, y: number): boolean {
    return Math.abs(x - this.x) < 64 && y > this.y - 80 && y < this.y + 100;
  }
}
