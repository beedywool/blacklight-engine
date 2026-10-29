import { Model3D } from '@blacklight/three';

/** A turning crate whose texture is KTX2 (Basis), transcoded by the decoder bundled with the game. */
export default class Crate extends Model3D {
  static override model = '@models/crate.glb';
  static override pixelsPerUnit = 110;
  static override collision = { layer: 'wall', solid: true };

  override update() {
    this.rotation3d.y += this.game.time.dt * 0.8;
    this.zIndex = this.y;
  }
}
