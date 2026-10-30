// The world is three screens wide and the camera follows the player (arrows). The red beacon is a
// world object anchored to the top-right corner of the screen: it stays there whatever the camera does.
import { Graphics, Scene, behaviors } from '@blacklight/core';

class Player extends Graphics {
  static override behaviors = [behaviors.eightDirections({ speed: 520 })];

  override create() {
    this.draw.rect(-24, -24, 48, 48).fill(0xffffff);
  }
}

class Beacon extends Graphics {
  static override behaviors = [
    behaviors.anchorToScreen({ x: 1, y: 0, offset: { x: -80, y: 80 } }),
    behaviors.sineWave({ property: 'scale', amplitude: 0.15, period: 0.8 }),
  ];

  override create() {
    this.draw.circle(0, 0, 32).fill(0xe60012);
  }
}

export default class Example extends Scene {
  static override size = { width: 3840, height: 720 };

  override create() {
    const ground = this.spawn(Graphics);
    for (let x = 0; x < 3840; x += 160) ground.draw.rect(x, 600, 80, 120).fill(0x3a3a3a);
    for (let x = 80; x < 3840; x += 320) ground.draw.circle(x, 200, 30).fill(0x222222);
    const player = this.spawn(Player, { x: 400, y: 360 });
    this.camera.follow(player, { lerp: 0.15 });
    this.spawn(Beacon);
  }
}
