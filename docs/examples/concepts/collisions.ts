// Arrows or WASD: walls stop the square, coins vanish on contact, the red ray stops at the first wall.
import type { GameObject } from '@blacklight/core';
import { Graphics, Scene, Text, behaviors } from '@blacklight/core';

class Player extends Graphics {
  static override hitbox = { type: 'box' as const, x: -24, y: -24, width: 48, height: 48 };
  static override collision = { layer: 'player' };
  static override behaviors = [behaviors.eightDirections({ speed: 420 })];
  coins = 0;

  override create() {
    this.draw.rect(-24, -24, 48, 48).fill(0xffffff);
  }

  override onCollide(other: GameObject) {
    if (!other.is(Coin)) return;
    other.destroy();
    this.coins++;
  }
}

class Wall extends Graphics {
  // Solid: objects moving with move(), velocity or a movement behavior stop against it.
  static override collision = { layer: 'walls', solid: true };
  width2 = 40;
  height2 = 200;

  override create() {
    this.draw.rect(0, 0, this.width2, this.height2).fill(0x8e8e8e);
  }
}

class Coin extends Graphics {
  static override hitbox = { type: 'circle' as const, radius: 16 };
  // Reports collisions with the player only.
  static override collision = { layer: 'pickup', mask: ['player'] };

  override create() {
    this.draw.circle(0, 0, 16).fill(0xffd60a);
  }
}

export default class Example extends Scene {
  private player!: Player;
  private ray!: Graphics;
  private score!: Text;

  override create() {
    this.spawn(Graphics).draw.rect(0, 0, this.width, this.height).fill(0x181818);
    this.spawn(Wall, { x: 500, y: 120 });
    this.spawn(Wall, { x: 500, y: 420, height2: 220 });
    this.spawn(Wall, { x: 800, y: 300, width2: 300, height2: 40 });
    for (let i = 0; i < 6; i++)
      this.spawn(Coin, { x: 700 + (i % 3) * 140, y: 180 + Math.floor(i / 3) * 360 });
    this.player = this.spawn(Player, { x: 240, y: this.height / 2 });
    this.ray = this.spawn(Graphics, { hitbox: 'none' });
    this.score = this.spawn(Text, {
      x: this.width / 2,
      y: 50,
      text: '',
      style: { fill: 0xededed, fontFamily: 'system-ui, sans-serif', fontSize: 32 },
    });
  }

  override update() {
    const from = { x: this.player.x, y: this.player.y };
    const to = { x: this.width, y: this.player.y };
    const hit = this.raycast(from, to, (object) => object.is(Wall));
    const end = hit?.point ?? to;
    this.ray.draw
      .clear()
      .moveTo(from.x, from.y)
      .lineTo(end.x, end.y)
      .stroke({ color: 0xe60012, width: 4 });
    this.score.text = `coins: ${this.player.coins}   ray: ${Math.round(hit?.distance ?? 0)} px`;
  }
}
