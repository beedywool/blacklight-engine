// Restoring a snapshot and replaying must give the run that never rolled back (NET-02 needs it).
import { describe, expect, it } from 'vitest';
import { GameObject } from '../src/objects/game-object';
import { testScene } from './helpers';

class Ball extends GameObject {
  static override hitbox = { type: 'circle' as const, radius: 8 };
  hits = 0;
  override onCollide(): void {
    this.hits++;
  }
}

class Spark extends GameObject {}

function state(scene: ReturnType<typeof testScene>) {
  return JSON.stringify({ ...scene.snapshot(), memory: undefined });
}

describe('snapshot restore for rollback', () => {
  it('replays onCollide for contacts that began after the snapshot', () => {
    const scene = testScene();
    const a = scene.spawn(Ball, { x: 0, y: 0 });
    scene.spawn(Ball, { x: 40, y: 0 });
    a.velocity.set(600, 0);
    const before = scene.snapshot();
    scene.tick(5);
    expect(a.hits).toBe(1);
    const reference = state(scene);
    scene.restore(before);
    scene.tick(5);
    expect(a.hits).toBe(1);
    expect(state(scene)).toBe(reference);
  });

  it('keeps update order and ids of re-created and newly spawned objects', () => {
    const scene = testScene();
    const balls = [1, 2, 3].map((i) => scene.spawn(Ball, { x: i * 100, y: 0 }));
    const before = scene.snapshot();
    balls[0]!.destroy();
    scene.spawn(Spark);
    scene.tick();
    scene.restore(before);
    expect(scene.objects.map((o) => o.x)).toEqual([100, 200, 300]);
    const spark = scene.spawn(Spark);
    expect(spark.id).toBe(before.nextId);
  });
});
