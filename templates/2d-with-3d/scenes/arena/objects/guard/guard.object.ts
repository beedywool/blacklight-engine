import { behaviors } from '@blacklight/core';
import { Model3D } from '@blacklight/three';
import { Mesh, MeshStandardMaterial } from 'three';

/** A patrolling robot loaded from a Draco-compressed file, recolored blue. */
export default class Guard extends Model3D {
  static override model = '@models/hero-draco.glb';
  static override pixelsPerUnit = 100;
  static override behaviors = [behaviors.patrol({ distance: 180, speed: 90, wait: 600 })];

  override create() {
    this.object3d.traverse((node) => {
      if (node instanceof Mesh && node.material instanceof MeshStandardMaterial) {
        // Clone: the material is shared by every object showing this file.
        node.material = node.material.clone();
        node.material.color.set(0x7fb0ff);
      }
    });
  }

  override update() {
    this.play(this.velocity.length > 1 ? 'walk' : 'idle');
    if (this.velocity.x !== 0) this.rotation3d.y = this.velocity.x > 0 ? Math.PI / 2 : -Math.PI / 2;
    else this.rotation3d.y = 0;
    this.zIndex = this.y;
  }
}
