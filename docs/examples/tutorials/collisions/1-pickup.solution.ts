// Arrows or WASD move the square over the coins. Make each coin disappear when the square touches it.
import { Graphics, Scene, behaviors, type GameObject } from '@blacklight/core';

class Player extends Graphics {
  static override hitbox = { type: 'box' as const, x: -24, y: -24, width: 48, height: 48 };
  static override collision = { layer: 'player' };
  static override behaviors = [behaviors.eightDirections({ speed: 420 })];

  override create() {
    this.draw.rect(-24, -24, 48, 48).fill(0xffffff);
  }

  override onCollide(other: GameObject) {
    // Called once when the player starts touching another object.
    if (other.is(Coin)) other.destroy();
  }
}

class Coin extends Graphics {
  static override hitbox = { type: 'circle' as const, radius: 16 };
  static override collision = { layer: 'pickup' };

  override create() {
    this.draw.circle(0, 0, 16).fill(0xffd60a);
  }
}

class Wall extends Graphics {
  static override hitbox = { type: 'box' as const, x: 0, y: -200, width: 40, height: 400 };
  static override collision = { layer: 'walls' };

  override create() {
    this.draw.rect(0, -200, 40, 400).fill(0x8e8e8e);
  }
}

class Spikes extends Graphics {
  static override hitbox = { type: 'box' as const, x: -100, y: -20, width: 200, height: 40 };

  override create() {
    for (let x = -100; x < 100; x += 40) this.draw.poly([x, 20, x + 20, -20, x + 40, 20]);
    this.draw.fill(0xe60012);
  }
}

export default class Example extends Scene {
  override create() {
    this.spawn(Graphics).draw.rect(0, 0, this.width, this.height).fill(0x181818);
    for (const x of [460, 580, 700]) this.spawn(Coin, { x, y: 360 });
    this.spawn(Wall, { x: 900, y: 360 });
    this.spawn(Spikes, { x: 240, y: 600 });
    this.spawn(Player, { x: 240, y: 360 });
  }
}
