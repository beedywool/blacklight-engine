// Left/right turn the tank, up/down drive it along its rotation; the rocks stop it. The turret
// turns towards the mouse at 120 degrees per second with the turnTowards helper.
import { Graphics, Scene, behaviors, turnTowards } from '@blacklight/core';

class Turret extends Graphics {
  // Decoration on the tank: no hitbox, so it never blocks its own hull.
  static override hitbox = 'none' as const;

  override create() {
    this.draw.rect(0, -6, 56, 12).fill(0xffffff).circle(0, 0, 18).fill(0xffffff);
  }
}

class Tank extends Graphics {
  static override behaviors = [behaviors.tankRotation({ speed: 260, turnSpeed: 150 })];
  turret!: Turret;

  override create() {
    this.draw.rect(-40, -28, 80, 56).fill(0x8e8e8e);
    this.draw.rect(-40, -34, 80, 10).fill(0x3a3a3a).rect(-40, 24, 80, 10).fill(0x3a3a3a);
    this.turret = this.scene.spawn(Turret, { parent: this });
  }

  override update() {
    const pointer = this.scene.pointer;
    // turnTowards works in radians on `rotation`; the turret's rotation is relative to the hull.
    const aim = Math.atan2(pointer.y - this.y, pointer.x - this.x) - this.rotation;
    turnTowards(this.turret, aim, 120, this.game.time.dt);
  }
}

export default class Example extends Scene {
  override create() {
    for (const [x, y, r] of [
      [300, 200, 50],
      [900, 480, 70],
      [1000, 160, 40],
    ] as const) {
      const rock = this.spawn(Graphics, { x, y });
      rock.draw.circle(0, 0, r).fill(0x3a3a3a);
      rock.collision.solid = true;
    }
    this.spawn(Tank, { x: 600, y: 360 });
  }
}
