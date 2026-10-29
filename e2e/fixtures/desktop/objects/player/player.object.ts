import { Graphics } from '@blacklight/core';

export default class Player extends Graphics {
  hp = 100;

  override create() {
    this.draw.rect(-16, -16, 32, 32).fill(0x4aa3ff);
  }
}
