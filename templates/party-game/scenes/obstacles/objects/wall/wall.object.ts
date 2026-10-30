// @blacklight-deterministic
import { Graphics, type Rect } from '@blacklight/core';
import { FIELD, WALL_WIDTH } from '../../rules';

/** A wall sliding left, with a gap players can stand in. Moved by the referee. */
export default class Wall extends Graphics {
  static override hitbox = 'none' as const;
  static override tags = ['wall'];

  /** Center of the gap. */
  gapY = 500;
  gapHeight = 300;
  /** Players (bit per player index) already given the point for this wall. */
  passed = 0;

  override create(): void {
    this.paint();
  }

  override onRestore(): void {
    this.paint();
  }

  private paint(): void {
    this.draw.clear();
    for (const part of this.parts()) {
      const r = { ...part, x: part.x - this.x, y: part.y - this.y };
      this.draw
        .rect(r.x, r.y, r.width, r.height)
        .fill(0xb05a2a)
        .stroke({ width: 4, color: 0x3a1a08 });
      for (let y = r.y + 30; y < r.y + r.height; y += 60)
        this.draw.rect(r.x, y, r.width, 4).fill(0x7a3a14);
    }
  }

  /** The two solid parts above and below the gap, in scene coordinates. */
  parts(): Rect[] {
    const left = this.x - WALL_WIDTH / 2;
    const top = this.gapY - this.gapHeight / 2;
    const bottom = this.gapY + this.gapHeight / 2;
    return [
      { x: left, y: FIELD.top - 40, width: WALL_WIDTH, height: top - FIELD.top + 40 },
      { x: left, y: bottom, width: WALL_WIDTH, height: FIELD.bottom + 40 - bottom },
    ];
  }
}
