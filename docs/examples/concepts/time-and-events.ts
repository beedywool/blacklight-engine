// Timers drop a block every 400 ms, tweens animate them, an event counts them. Space: slow motion.
import { Graphics, Scene, Text } from '@blacklight/core';

export default class Example extends Scene {
  private count = 0;
  private info!: Text;

  override create() {
    this.spawn(Graphics).draw.rect(0, 0, this.width, this.height).fill(0x181818);
    this.info = this.spawn(Text, {
      x: this.width / 2,
      y: 60,
      text: '',
      style: { fill: 0xededed, fontFamily: 'system-ui, sans-serif', fontSize: 32 },
    });

    // The scene bus: listeners end with the scene.
    this.listen(this.events, 'dropped', () => this.count++);

    // Game-time timers: they pause with the game and follow time.scale.
    this.every(400, () => this.drop());
    this.after(1500, () => (this.info.style.fill = 0xffffff));
  }

  private drop() {
    const block = this.spawn(Graphics, { x: this.random.int(100, this.width - 100), y: 120 });
    block.draw.rect(-30, -30, 60, 60).fill(this.random.pick([0xffffff, 0x8e8e8e, 0xe60012]));
    this.events.emit('dropped', undefined);
    // Tweens run on the scene clock; `finished` resolves at the end.
    void block
      .tween({ y: this.height - 60, rotation: Math.PI }, { duration: 1200, ease: 'backOut' })
      .finished.then(() => block.tween({ alpha: 0 }, { duration: 300 }).finished)
      .then(() => block.destroy());
  }

  override update() {
    if (this.input.pressed('jump')) this.game.time.scale = this.game.time.scale === 1 ? 0.25 : 1;
    this.info.text = `${this.count} dropped · time scale ${this.game.time.scale} · ${(this.steps / 60).toFixed(1)} s`;
  }
}
