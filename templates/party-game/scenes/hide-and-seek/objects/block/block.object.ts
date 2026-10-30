// @blacklight-deterministic
import { Graphics, type Rect } from '@blacklight/core';

/** A colored block players hide behind; a ball knocks it away. */
export default class Block extends Graphics {
  static override hitbox = 'none' as const;
  static override tags = ['block'];

  blockWidth = 200;
  blockHeight = 200;
  color = 0xffffff;

  override create(): void {
    this.paint();
  }

  override onRestore(): void {
    this.paint();
  }

  private paint(): void {
    this.draw.clear();
    this.draw
      .roundRect(0, 0, this.blockWidth, this.blockHeight, 18)
      .fill(this.color)
      .stroke({ width: 6, color: 0x111111 });
    this.draw.rect(14, 14, this.blockWidth - 28, 16).fill({ color: 0xffffff, alpha: 0.35 });
  }

  get rect(): Rect {
    return { x: this.x, y: this.y, width: this.blockWidth, height: this.blockHeight };
  }
}
