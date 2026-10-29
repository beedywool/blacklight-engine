import { Graphics, Scene } from '@blacklight/core';

export default class Level extends Scene {
  override create() {
    const floor = this.spawn(Graphics, { x: 0, y: 140 });
    floor.draw.rect(0, 0, this.width, 40).fill(0x303030);
    const wall = this.spawn(Graphics, { x: 240, y: 60 });
    wall.draw.rect(0, 0, 16, 80).fill(0x8e8e8e);
    wall.collision.solid = true;
    for (let i = 0; i < 3; i++) this.spawn('Coin', { x: 120 + i * 30, y: 100 });
    this.spawn('Hero', { x: 60, y: 100 });
  }
}
