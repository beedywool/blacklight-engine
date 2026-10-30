// Guards walk back and forth: the top one pauses at each end, the middle one patrols vertically,
// the bottom one turns around early when it bumps into the wall.
import { Graphics, Scene, behaviors, type Patrol } from '@blacklight/core';

class Guard extends Graphics {
  override create() {
    this.draw.rect(-24, -24, 48, 48).fill(0xffffff);
    this.draw.rect(8, -10, 10, 10).fill(0x080808);
  }

  override update() {
    // `direction` is 1 or -1: face the way it walks.
    const patrol = this.behavior<Patrol>('patrol');
    if (patrol && patrol.options.axis !== 'y') this.scale.x = patrol.direction;
  }
}

export default class Example extends Scene {
  override create() {
    this.spawn(Guard, { x: 400, y: 140 }).addBehavior(
      behaviors.patrol({ distance: 300, speed: 240, wait: 600 }),
    );
    this.spawn(Guard, { x: 1100, y: 360 }).addBehavior(
      behaviors.patrol({ distance: 200, speed: 200, axis: 'y' }),
    );
    const wall = this.spawn(Graphics, { x: 820, y: 520 });
    wall.draw.rect(0, 0, 30, 120).fill(0x8e8e8e);
    wall.collision.solid = true;
    this.spawn(Guard, { x: 500, y: 580 }).addBehavior(
      behaviors.patrol({ distance: 500, speed: 260 }),
    );
  }
}
