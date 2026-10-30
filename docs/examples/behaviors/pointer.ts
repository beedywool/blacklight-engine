// Hover the cards with the mouse and click one to flip it; the white disc can be dragged.
import { Graphics, Scene, behaviors, type PointerBehavior } from '@blacklight/core';

class Card extends Graphics {
  flipped = false;

  override create() {
    this.paint();
    this.addBehavior(behaviors.pointer({ onClick: () => this.flip() }));
  }

  flip() {
    this.flipped = !this.flipped;
    this.paint();
  }

  paint() {
    this.draw.clear();
    this.draw.roundRect(-80, -110, 160, 220, 16).fill(this.flipped ? 0xe60012 : 0x3a3a3a);
  }

  override update() {
    // `hovered` and `pressed` are kept up to date by the behavior.
    const pointer = this.behavior<PointerBehavior>('pointer')!;
    this.scale.set(pointer.pressed ? 0.95 : pointer.hovered ? 1.08 : 1);
  }
}

export default class Example extends Scene {
  override create() {
    for (let i = 0; i < 3; i++) this.spawn(Card, { x: 300 + i * 220, y: 360 });
    const disc = this.spawn(Graphics, { x: 1040, y: 360 });
    disc.draw.circle(0, 0, 60).fill(0xffffff);
    disc.addBehavior(behaviors.pointer({ draggable: true }));
  }
}
