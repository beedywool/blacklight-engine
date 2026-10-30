// Move with the arrows and touch the red spikes: the hero flashes for one second and cannot be hit
// again meanwhile. Click the hero to start a slower flash by hand.
import { Graphics, Scene, Text, behaviors, type Flash, type GameObject } from '@blacklight/core';

class Hero extends Graphics {
  static override behaviors = [
    behaviors.eightDirections({ speed: 380 }),
    behaviors.flash({ interval: 60, autoStart: 600 }),
  ];
  hits = 0;

  override create() {
    this.draw.rect(-28, -28, 56, 56).fill(0xffffff);
    this.addBehavior(behaviors.pointer({ onClick: () => this.flash.start(2000) }));
  }

  get flash() {
    return this.behavior<Flash>('flash')!;
  }

  override onCollide(other: GameObject) {
    // `flashing` doubles as invulnerability time.
    if (!other.is('Spike') || this.flash.flashing) return;
    this.hits++;
    this.flash.start(1000);
  }
}

class Spike extends Graphics {
  override create() {
    this.draw.poly([0, -36, 32, 28, -32, 28]).fill(0xe60012);
  }
}

export default class Example extends Scene {
  hero!: Hero;
  label!: Text;

  override create() {
    for (let i = 0; i < 4; i++) this.spawn(Spike, { x: 260 + i * 260, y: 220 + (i % 2) * 280 });
    this.hero = this.spawn(Hero, { x: 640, y: 600 });
    this.label = this.spawn(Text, {
      x: 640,
      y: 50,
      style: { fill: 0xc2c2c2, fontFamily: 'monospace', fontSize: 28 },
    });
  }

  override update() {
    const { hits, flash } = this.hero;
    this.label.text = `hits ${hits}   remaining ${Math.max(0, Math.round(flash.remaining))} ms`;
  }
}
