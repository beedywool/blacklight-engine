// A behavior written for this game: objects pulse. Press Space to turn it off and on for all.
import { Behavior, Graphics, Scene, type GameObject } from '@blacklight/core';

interface PulseOptions {
  /** Scale added at the peak. */
  amount: number;
  /** Seconds per pulse. @defaultValue 1 */
  period?: number;
}

class Pulse extends Behavior<PulseOptions> {
  readonly name = 'pulse';
  private time = 0;

  override update(object: GameObject, dt: number) {
    this.time += dt;
    const phase = (this.time / (this.options.period ?? 1)) * Math.PI * 2;
    object.scale.set(1 + this.options.amount * (0.5 + 0.5 * Math.sin(phase)));
  }

  override detach(object: GameObject) {
    object.scale.set(1);
  }
}

/** The spec function: every object gets its own instance. */
const pulse = (options: PulseOptions) => () => new Pulse(options);

class Dot extends Graphics {
  static override behaviors = [pulse({ amount: 0.4, period: 0.8 })];

  override create() {
    this.draw.circle(0, 0, 36).fill(0xffffff);
  }
}

export default class Example extends Scene {
  override create() {
    this.spawn(Graphics).draw.rect(0, 0, this.width, this.height).fill(0x181818);
    for (let i = 0; i < 5; i++) {
      const dot = this.spawn(Dot, { x: 240 + i * 200, y: this.height / 2 });
      // Several behaviors per object: this one is added to a single instance.
      if (i % 2 === 0) dot.addBehavior(pulse({ amount: 0.2, period: 2 }));
    }
  }

  override update() {
    if (!this.input.pressed('jump')) return;
    for (const object of this.objects) {
      const behavior = object.behavior<Pulse>('pulse');
      if (behavior) behavior.enabled = !behavior.enabled;
    }
  }
}
