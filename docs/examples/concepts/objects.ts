// Objects: a container with children, layers and z-order, alpha, tint and a Pixi filter.
import { Container, Graphics, Scene, Text } from '@blacklight/core';
import { BlurFilter } from 'pixi.js';

/** A game object is a class; fields are spawn props. */
class Planet extends Graphics {
  radius = 60;
  color = 0xffffff;
  speed = 1;

  override create() {
    this.draw.circle(0, 0, this.radius).fill(this.color);
  }

  override update() {
    this.rotation += this.speed / 60;
  }
}

export default class Example extends Scene {
  // Draw layers, back to front; 'hud' always exists and ignores the camera.
  static override layers = ['background', 'main', 'front'];

  override create() {
    const sky = this.spawn(Graphics, { layer: 'background' });
    sky.draw.rect(0, 0, this.width, this.height).fill(0x0d0d0d);

    // Children move, rotate and fade with their parent.
    const system = this.spawn(Container, { x: 440, y: this.height / 2 });
    const orbit = this.spawn(Graphics, { parent: system });
    orbit.draw.circle(0, 0, 200).stroke({ color: 0x3a3a3a, width: 4 });
    this.spawn(Planet, { parent: system, radius: 70 });
    this.spawn(Planet, { parent: system, x: 200, radius: 26, color: 0xe60012, speed: 4 });
    this.every(16, () => (system.rotation += 0.01));

    // zIndex orders objects inside a layer; alpha and tint change how they draw.
    for (let i = 0; i < 3; i++) {
      const card = this.spawn(Graphics, { layer: 'front', x: 860 + i * 70, y: 300 + i * 50 });
      card.draw.roundRect(-110, -80, 220, 160, 20).fill(0xffffff);
      card.tint = [0xffffff, 0x8e8e8e, 0xe60012][i]!;
      card.zIndex = 3 - i;
    }
    const ghost = this.spawn(Graphics, { layer: 'front', x: 1000, y: 580, alpha: 0.4 });
    ghost.draw.circle(0, 0, 60).fill(0xffffff);
    ghost.filters = [new BlurFilter({ strength: 8 })];

    this.spawn(Text, {
      layer: 'hud',
      x: this.width / 2,
      y: 50,
      text: `${this.objects.length} objects`,
      style: { fill: 0xc2c2c2, fontFamily: 'system-ui, sans-serif', fontSize: 32 },
    });
  }
}
