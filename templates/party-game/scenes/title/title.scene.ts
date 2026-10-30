import { Graphics, Scene } from '@blacklight/core';
import { SKINS, drawSkin } from '../../party/skins';

/** Title: the eight skins bounce on a striped stage behind the menu. */
export default class Title extends Scene {
  private mascots: { body: Graphics; baseY: number; phase: number }[] = [];
  private time = 0;

  override create(): void {
    const stage = this.spawn(Graphics, { zIndex: -1 });
    stage.draw.rect(0, 0, 1920, 1080).fill(0x111111);
    for (let i = -4; i < 20; i++)
      stage.draw
        .poly([i * 160, 0, i * 160 + 80, 0, i * 160 + 380, 1080, i * 160 + 300, 1080])
        .fill(0x1b1b1b);
    stage.draw.rect(0, 860, 1920, 220).fill(0x1d1d24);
    this.mascots = SKINS.map((_, i) => {
      const body = this.spawn(Graphics, { x: 1000 + i * 110, y: 800, zIndex: 1 });
      drawSkin(body.draw, i, 46, Math.PI / 2);
      return { body, baseY: 800 - (i % 2) * 40, phase: i * 0.7 };
    });
    this.ui.open('TitleScreen', {}, { enter: 'slash', leave: 'fade' });
  }

  override update(): void {
    this.time += this.game.time.dt;
    for (const { body, baseY, phase } of this.mascots) {
      body.y = baseY - Math.abs(Math.sin(this.time * 3 + phase)) * 70;
      body.rotation = Math.sin(this.time * 2 + phase) * 0.15;
    }
  }
}
