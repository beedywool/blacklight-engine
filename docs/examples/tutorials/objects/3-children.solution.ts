// The red planet turns. Put a moon in orbit around it: a planet spawned as its child.
import { Graphics, Scene } from '@blacklight/core';

/** A game object is a class. Its fields can be set when it is spawned. */
class Planet extends Graphics {
  radius = 60;
  color = 0xffffff;
  speed = 0;

  override create() {
    // A notch on the edge, so that turning shows.
    this.draw.circle(0, 0, this.radius).fill(this.color);
    this.draw.circle(this.radius * 0.6, 0, this.radius * 0.2).fill(0x080808);
  }

  override update() {
    this.rotation += this.speed / 60;
  }
}

export default class Example extends Scene {
  override create() {
    this.spawn(Graphics).draw.rect(0, 0, this.width, this.height).fill(0x0d0d0d);
    this.spawn(Planet, { x: 300, y: 360 });
    this.spawn(Planet, { x: 640, y: 360, radius: 90, color: 0x8e8e8e });
    const red = this.spawn(Planet, { x: 1000, y: 360, radius: 40, color: 0xe60012, speed: 2 });
    this.spawn(Planet, { parent: red, x: 90, radius: 14 });
  }
}
