// Spin is a behavior written for this game, attached to the star. Its update() is empty: fill it in.
import { Behavior, Graphics, Scene, behaviors, type GameObject } from '@blacklight/core';

/** A behavior written for this game. `options` holds what the spec function was given. */
class Spin extends Behavior<{ speed: number }> {
  readonly name = 'spin';

  override update(object: GameObject, dt: number) {
    // Runs every step, before the object's own update(). `dt` is the step length in seconds.
    object.rotation += this.options.speed * dt;
  }
}

/** The spec function: every object that lists it gets its own Spin. */
const spin = (options: { speed: number }) => () => new Spin(options);

class Ship extends Graphics {
  static override behaviors = [
    behaviors.eightDirections({ speed: 600, acceleration: 3000, deceleration: 4000 }),
    behaviors.wrapAroundScreen(),
  ];

  override create() {
    this.draw.poly([0, -44, 36, 36, 0, 16, -36, 36]).fill(0xffffff);
  }
}

class Star extends Graphics {
  static override behaviors = [
    behaviors.sineWave({ property: 'y', amplitude: 30, period: 2 }),
    spin({ speed: 3 }),
  ];

  override create() {
    this.draw.star(0, 0, 5, 40, 18).fill(0xe60012);
  }

  override update() {
    this.behavior('sineWave')!.enabled = !this.input.held('jump');
  }
}

export default class Example extends Scene {
  override create() {
    this.spawn(Graphics).draw.rect(0, 0, this.width, this.height).fill(0x181818);
    this.spawn(Ship, { x: 400, y: 360 });
    this.spawn(Star, { x: 900, y: 360 });
  }
}
