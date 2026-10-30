// Drag the discs into the slots. A drop outside a slot sends the disc back to where it started.
import { Graphics, Scene, behaviors } from '@blacklight/core';

class Slot extends Graphics {
  static override tags = ['slot'];

  override create() {
    this.draw.roundRect(-70, -70, 140, 140, 18).stroke({ color: 0x8e8e8e, width: 4 });
  }
}

class Token extends Graphics {
  static override behaviors = [
    behaviors.dragAndDrop({
      dropOn: 'slot',
      // The slot accepted the drop: center the disc in it.
      onDrop: (token, slot) => {
        if (slot) token.teleport(slot.x, slot.y);
      },
    }),
  ];

  override create() {
    this.draw.circle(0, 0, 50).fill(0xffffff);
  }
}

export default class Example extends Scene {
  override create() {
    for (let i = 0; i < 3; i++) this.spawn(Slot, { x: 400 + i * 240, y: 220 });
    for (let i = 0; i < 3; i++) this.spawn(Token, { x: 400 + i * 240, y: 520 });
  }

  override update() {
    // A slot turns red while a disc sits in it.
    const tokens = this.findAll('Token');
    for (const slot of this.findAll('slot'))
      slot.tint = tokens.some((t) => t.x === slot.x && t.y === slot.y) ? 0xe60012 : 0xffffff;
  }
}
