// Enter takes a snapshot of the scene, Backspace goes back to it. Click to add balls in between.
import { Graphics, Scene, Text, behaviors, type SceneSnapshot } from '@blacklight/core';

class Ball extends Graphics {
  static override behaviors = [behaviors.bounce({ speed: 380, angle: 30 })];
  // Data fields are saved by snapshots.
  color = 0xffffff;

  override create() {
    this.redraw();
  }

  // Called after a restore, instead of create(): redraw from the restored fields.
  override onRestore() {
    this.redraw();
  }

  private redraw() {
    this.draw.clear().circle(0, 0, 26).fill(this.color);
  }
}

export default class Example extends Scene {
  private saved: SceneSnapshot | undefined;
  private info!: Text;

  override create() {
    this.spawn(Graphics).draw.rect(0, 0, this.width, this.height).fill(0x181818);
    for (let i = 0; i < 3; i++) this.spawn(Ball, { x: 300 + i * 300, y: 300 + i * 60 });
    this.info = this.spawn(Text, {
      layer: 'hud',
      x: this.width / 2,
      y: 50,
      text: '',
      style: { fill: 0xededed, fontFamily: 'system-ui, sans-serif', fontSize: 32 },
    });
  }

  override update() {
    if (this.input.pressed('confirm')) this.saved = this.snapshot();
    if (this.input.pressed('back') && this.saved) this.restore(this.saved);
    if (this.pointer.pressed)
      this.spawn(Ball, { x: this.pointer.x, y: this.pointer.y, color: 0xe60012 });
    const balls = this.findAll(Ball).length;
    this.info.text = `${balls} balls · snapshot ${this.saved ? `at step ${this.saved.steps}` : 'not taken'}`;
  }
}
