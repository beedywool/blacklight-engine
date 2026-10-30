// Click anywhere: a blip plays from that point (left/right panning), higher when you click higher.
import { Graphics, Scene, Text } from '@blacklight/core';

export default class Example extends Scene {
  // Loaded before create(); `blip` is the key of assets/blip.wav.
  static override assets = ['@assets/blip.wav'];
  private info!: Text;

  override create() {
    this.spawn(Graphics).draw.rect(0, 0, this.width, this.height).fill(0x181818);
    this.info = this.spawn(Text, {
      x: this.width / 2,
      y: 60,
      text: '',
      style: { fill: 0xededed, fontFamily: 'system-ui, sans-serif', fontSize: 32 },
    });
    this.game.audio.volume('sfx', 0.6);
  }

  override update() {
    if (this.pointer.pressed) {
      const { x, y } = this.pointer;
      this.audio.play('blip', { at: { x, y }, range: this.width, rate: 1.6 - y / this.height });
      const ring = this.spawn(Graphics, { x, y });
      ring.draw.circle(0, 0, 30).stroke({ color: 0xffffff, width: 6 });
      ring
        .tween({ alpha: 0, 'scale.x': 3, 'scale.y': 3 }, { duration: 400 })
        .finished.then(() => ring.destroy());
    }
    // Browsers keep audio silent until the first click or key press.
    const state = this.game.audio.unlocked ? 'unlocked' : 'locked until the first gesture';
    this.info.text = `audio ${state} · ${this.game.audio.history.length} sounds played`;
  }
}
