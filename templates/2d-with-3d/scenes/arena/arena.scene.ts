import { Graphics, Scene } from '@blacklight/core';
import type { Layers3D } from '@blacklight/three';

/**
 * Models between two 2D layers: the sky and floor are drawn behind (`back`), the robots, the crate
 * and the bushes share `actors` and are sorted by their y, the pillars and the fence in `front`
 * pass over everything. The portrait in the corner is a render-to-texture model with a filter and
 * a mask; Escape opens a menu showing the hero turning (a Vue screen).
 */
export default class Arena extends Scene {
  static override layers = ['back', 'actors', 'front'];
  static layers3d: Layers3D = {
    actors: { camera: 'perspective', fov: 35, sun: { from: [-0.5, 1, 0.9], intensity: 2.6 } },
  };

  override create() {
    const back = this.spawn(Graphics, { layer: 'back' });
    back.draw.rect(0, 0, 1280, 300).fill(0x1a2a4a);
    back.draw.rect(0, 300, 1280, 420).fill(0x2f5a3a);
    for (let x = -400; x < 1280; x += 80) back.draw.moveTo(x, 720).lineTo(x + 300, 300);
    back.draw.stroke({ color: 0x3a6a46, width: 3 });
    back.draw.circle(1060, 120, 54).fill(0xf3e9b5);

    for (const [x, y] of [
      [220, 380],
      [930, 360],
      [400, 610],
      [1100, 560],
    ] as const) {
      const bush = this.spawn(Graphics, { x, y, layer: 'actors', zIndex: y, label: 'Bush' });
      bush.draw.circle(-26, -18, 30).circle(18, -26, 34).circle(4, -6, 30).fill(0x1f7a3a);
    }

    const front = this.spawn(Graphics, { layer: 'front', label: 'Fence' });
    front.draw.rect(0, 668, 1280, 52).fill(0x5a3a22);
    front.draw.rect(560, 0, 40, 720).fill(0x7a7f8c);
    front.draw.rect(1210, 0, 40, 720).fill(0x7a7f8c);

    this.spawn('Hero', { x: 610, y: 500, layer: 'actors' });
    this.spawn('Guard', { x: 860, y: 430, layer: 'actors' });
    this.spawn('Crate', { x: 330, y: 470, layer: 'actors' });
    this.spawn('Portrait', { x: 1150, y: 120, layer: 'hud' });
  }

  override update() {
    if (this.input.pressed('pause')) this.ui.push('PauseMenu');
  }
}
