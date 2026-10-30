// Fly off any edge with the ship (left/right to turn, up to thrust) and come back from the other
// side. The rocks drift and wrap too.
import { Graphics, Scene, behaviors } from '@blacklight/core';

class Ship extends Graphics {
  static override behaviors = [
    behaviors.tankRotation({ speed: 380, turnSpeed: 220 }),
    behaviors.wrapAroundScreen(),
  ];

  override create() {
    this.draw.poly([30, 0, -20, -20, -10, 0, -20, 20]).fill(0xffffff);
  }
}

class Rock extends Graphics {
  override create() {
    this.draw.circle(0, 0, 30).fill(0x8e8e8e);
    // Ghost hitbox: rocks pass through each other.
    this.collision.blockedBySolids = false;
  }
}

export default class Example extends Scene {
  override create() {
    for (let i = 0; i < 6; i++) {
      const rock = this.spawn(Rock, { x: 150 + i * 200, y: 100 + ((i * 230) % 520) });
      rock.addBehavior(behaviors.bullet({ speed: 90 + i * 20, angle: i * 61 }));
      // margin: wrap only once fully off screen plus 20 px.
      rock.addBehavior(behaviors.wrapAroundScreen({ margin: 20 }));
    }
    this.spawn(Ship, { x: 640, y: 360, rotation: -Math.PI / 2 });
  }
}
