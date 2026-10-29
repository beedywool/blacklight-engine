import { Graphics } from '@blacklight/core';
import { ARENA, RING } from '../../rules';

/** The arena: dark floor, light ring. Display only. */
export default class Ring extends Graphics {
  static override hitbox = 'none' as const;

  override create(): void {
    this.paint();
  }

  override onRestore(): void {
    this.paint();
  }

  private paint(): void {
    this.draw.clear();
    this.draw.rect(0, 0, ARENA.width, ARENA.height).fill(0x141414);
    this.draw.circle(RING.x, RING.y, RING.radius).fill(0x2b2b2b);
    this.draw.circle(RING.x, RING.y, RING.radius).stroke({ width: 4, color: 0xd9d9d9 });
  }
}
