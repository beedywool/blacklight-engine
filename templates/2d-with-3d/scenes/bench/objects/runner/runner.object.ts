import { Model3D } from '@blacklight/three';

/** One of the two animated 10 000-triangle models of the benchmark, walking on the spot. */
export default class Runner extends Model3D {
  static override model = '@models/hero.glb';
  static override pixelsPerUnit = 150;
  static override defaultAnimation = 'walk';

  override update() {
    this.rotation3d.y += this.game.time.dt * 0.5;
  }
}
