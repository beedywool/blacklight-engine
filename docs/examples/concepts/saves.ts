// Click to add points. Enter saves to slot 1, Backspace loads it back (also after Run again).
import { Graphics, Scene, Text } from '@blacklight/core';

export default class Example extends Scene {
  private info!: Text;
  private status = 'nothing saved yet';

  override async create() {
    this.spawn(Graphics).draw.rect(0, 0, this.width, this.height).fill(0x181818);
    this.info = this.spawn(Text, {
      x: this.width / 2,
      y: this.height / 2,
      text: '',
      style: { fill: 0xededed, fontFamily: 'system-ui, sans-serif', fontSize: 40, align: 'center' },
    });
    // `game.save.data` is what a save writes; start from an empty game.
    this.game.save.reset({ points: 0 });
    const [slot] = await this.game.save.list();
    if (slot?.meta)
      this.status = `slot ${slot.slot}: "${slot.meta.label}" from ${new Date(slot.meta.date).toLocaleTimeString()}`;
  }

  override update() {
    const data = this.game.save.data as { points: number };
    if (this.pointer.pressed) data.points++;
    if (this.input.pressed('confirm')) {
      void this.game.save.save(1, { label: `${data.points} points` }).then((meta) => {
        this.status = `saved "${meta.label}"`;
      });
    }
    if (this.input.pressed('back')) {
      void this.game.save.load(1).then(
        () => (this.status = 'loaded slot 1'),
        () => (this.status = 'slot 1 is empty'),
      );
    }
    this.info.text = `${data.points} points\n${this.status}`;
  }
}
