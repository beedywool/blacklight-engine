import { Graphics } from '@blacklight/core';
import { Model3D } from '@blacklight/three';
import { ColorMatrixFilter } from 'pixi.js';

/**
 * A render-to-texture model in the HUD: drawn into a texture, it takes a Pixi filter (sepia) and a
 * round mask like any sprite.
 */
export default class Portrait extends Model3D {
  static override model = '@models/hero.glb';
  static override pixelsPerUnit = 220;
  static override renderToTexture = { width: 200, height: 200, center: { x: 0, y: 1.5 } };
  static override view = { camera: 'perspective' as const, fov: 30 };
  static override defaultAnimation = 'wave';
  static override animations = { wave: { loop: true } };

  override create() {
    const sepia = new ColorMatrixFilter();
    sepia.sepia(false);
    this.filters = [sepia];
    const ring = this.scene.spawn(Graphics, { x: this.x, y: this.y, layer: 'hud' });
    ring.draw.circle(0, 0, 77).stroke({ color: 0xffffff, width: 6 });
    const mask = this.scene.spawn(Graphics, { x: this.x, y: this.y, layer: 'hud' });
    mask.draw.circle(0, 0, 74).fill(0xffffff);
    this.mask = mask;
    // The model's origin is at its feet: lower it so the head (1.5 units up) fills the ring.
    this.teleport(this.x, this.y + 1.5 * Portrait.pixelsPerUnit);
  }
}
