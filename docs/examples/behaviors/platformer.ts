// Left/right to run, Space or Z to jump (hold it for a higher jump, press again in the air for a
// double jump). Try the slope, the one-way ledge (jump through it from below) and the red lift.
import { Graphics, Scene, behaviors, type HitboxSpec, type Platformer } from '@blacklight/core';

class Hero extends Graphics {
  static override behaviors = [
    behaviors.platformer({ speed: 360, jumpStrength: 900, airJumps: 1 }),
  ];

  override create() {
    this.draw.rect(-18, -28, 36, 56).fill(0xffffff);
    this.draw.rect(4, -18, 8, 8).fill(0x080808);
  }

  override update() {
    const move = this.behavior<Platformer>('platformer')!;
    this.scale.x = move.facing === 'left' ? -1 : 1;
    // `state` is idle, run, jump or fall.
    this.tint = move.state === 'jump' || move.state === 'fall' ? 0xc2c2c2 : 0xffffff;
    if (this.y > 900) this.teleport(200, 400);
  }
}

class Block extends Graphics {
  override create() {
    this.collision.solid = true;
  }
}

class Ramp extends Graphics {
  static override hitbox: HitboxSpec = {
    type: 'polygon',
    points: [
      [0, 0],
      [240, -160],
      [240, 0],
    ],
  };

  override create() {
    this.collision.solid = true;
    this.draw.poly([0, 0, 240, -160, 240, 0]).fill(0x3a3a3a);
  }
}

export default class Example extends Scene {
  override create() {
    const ground = this.spawn(Block, { x: 0, y: 640 });
    ground.draw.rect(0, 0, this.width, 80).fill(0x3a3a3a);

    this.spawn(Ramp, { x: 780, y: 640 });
    const top = this.spawn(Block, { x: 1020, y: 480 });
    top.draw.rect(0, 0, 260, 160).fill(0x3a3a3a);

    // One-way platform: solid from above only.
    const ledge = this.spawn(Graphics, { x: 140, y: 470 });
    ledge.draw.rect(0, 0, 260, 14).fill(0x8e8e8e);
    ledge.collision.jumpThru = true;

    // A solid object that moves carries what stands on it.
    const lift = this.spawn(Block, { x: 480, y: 420 });
    lift.draw.rect(0, 0, 160, 20).fill(0xe60012);
    lift.addBehavior(behaviors.patrol({ distance: 140, speed: 120, axis: 'y', wait: 400 }));

    this.spawn(Hero, { x: 200, y: 560 });
  }
}
