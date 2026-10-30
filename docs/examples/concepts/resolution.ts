// A square 1000x1000 design in a wide preview: `extend` shows more on the long side.
// Change mode to 'letterbox' to get black bars instead.
import { Graphics, Scene, Text, type GameConfig } from '@blacklight/core';

// In a project this is game.config.ts; here it is merged over the example defaults.
export const config: Partial<GameConfig> = {
  resolution: { width: 1000, height: 1000, mode: 'extend' },
};

export default class Example extends Scene {
  private label!: Text;

  override create() {
    // Backgrounds are larger than the design area so the extra space is covered.
    const back = this.spawn(Graphics);
    back.draw.rect(-1000, -500, 3000, 2000).fill(0x2c2c2c);
    for (let x = -1000; x < 2000; x += 100) back.draw.rect(x, -500, 2, 2000).fill(0x3a3a3a);
    // The design area: (0, 0) to (width, height), whatever the screen.
    const design = this.spawn(Graphics);
    design.draw
      .rect(0, 0, this.width, this.height)
      .fill(0x111111)
      .stroke({ color: 0xffffff, width: 8 });
    this.label = this.spawn(Text, {
      x: this.width / 2,
      y: this.height / 2,
      text: '',
      style: { fill: 0xededed, fontFamily: 'system-ui, sans-serif', fontSize: 64, align: 'center' },
    });
  }

  override update() {
    // The visible area follows the window size; read it when you need it.
    const view = this.game.viewport;
    const visible = view
      ? `${Math.round(view.visibleWidth)} x ${Math.round(view.visibleHeight)}`
      : '';
    this.label.text = `design area\n${this.width} x ${this.height}\n\nvisible\n${visible}`;
  }
}
