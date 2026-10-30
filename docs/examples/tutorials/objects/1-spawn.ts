// Two planets, each spawned with its own properties. Add a third one: red, smaller, on the right.
import { Graphics, Scene } from '@blacklight/core';

/** A game object is a class. Its fields can be set when it is spawned. */
class Planet extends Graphics {
  radius = 60;
  color = 0xffffff;

  override create() {
    // A notch on the edge, so that turning shows.
    this.draw.circle(0, 0, this.radius).fill(this.color);
    this.draw.circle(this.radius * 0.6, 0, this.radius * 0.2).fill(0x080808);
  }
}

export default class Example extends Scene {
  override create() {
    this.spawn(Graphics).draw.rect(0, 0, this.width, this.height).fill(0x0d0d0d);
    this.spawn(Planet, { x: 300, y: 360 });
    this.spawn(Planet, { x: 640, y: 360, radius: 90, color: 0x8e8e8e });
  }
}
