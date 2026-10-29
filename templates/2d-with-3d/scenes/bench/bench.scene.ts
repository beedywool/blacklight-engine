import { Graphics, Scene, Text } from '@blacklight/core';
import type { Layers3D } from '@blacklight/three';
import { UPDATE_PRIORITY } from 'pixi.js';

/** Frames ignored at the start (shader compilation, first uploads). */
const WARMUP_MS = 1500;
/** Length of one measure. */
const MEASURE_MS = 5000;

/**
 * Budget check (3D-07): a 2D scene with two animated 10 000-triangle models between 2D layers.
 * After a warm-up it measures 5 s of displayed frames: frame rate, 95th percentile of the frame
 * interval, and the main-thread time of each frame (game steps, drawing, Pixi and Three.js
 * commands). Results appear on screen and on the game element (`data-bench-fps`,
 * `data-bench-p95-ms`, `data-bench-cpu-ms`, `data-bench-cpu-p95-ms`). Open `/#bench` to run it,
 * `/#bench-2d` for the same scene without the models.
 */
export default class Bench extends Scene<{ models?: boolean }> {
  static override layers = ['back', 'models', 'front'];
  static layers3d: Layers3D = { models: { camera: 'perspective', fov: 35 } };

  private readonly intervals: number[] = [];
  private readonly cpu: number[] = [];
  private startedAt = 0;
  private frameStart = 0;
  private last = 0;
  private label!: Text;
  private stripes!: Graphics;

  override create({ models = true } = {}) {
    delete this.game.mount.dataset.benchFps;
    const back = this.spawn(Graphics, { layer: 'back' });
    back.draw.rect(0, 0, 1280, 720).fill(0x15171d);
    for (let i = 0; i < 40; i++)
      back.draw.circle((i * 211) % 1280, (i * 97) % 720, 6 + (i % 5) * 3).fill(0x2a3550);
    if (models) {
      this.spawn('Runner', { x: 420, y: 600, layer: 'models' });
      this.spawn('Runner', { x: 860, y: 600, layer: 'models' });
    }
    this.stripes = this.spawn(Graphics, { layer: 'front' });
    this.label = this.spawn(Text, {
      x: 640,
      y: 60,
      layer: 'hud',
      text: 'measuring…',
      style: { fill: 0xffffff, fontSize: 30 },
    });
    // The game's own ticker work runs between these two: everything the frame costs the CPU.
    const ticker = this.game.app.ticker;
    const begin = () => (this.frameStart = performance.now());
    const end = () => this.measure();
    ticker.add(begin, undefined, UPDATE_PRIORITY.INTERACTION);
    ticker.add(end, undefined, UPDATE_PRIORITY.UTILITY);
    this.disposables.add(() => {
      ticker.remove(begin);
      ticker.remove(end);
    });
  }

  override render() {
    // Moving 2D content in front of the models, redrawn every frame.
    const t = performance.now() / 1000;
    this.stripes.draw.clear();
    for (let i = 0; i < 8; i++)
      this.stripes.draw.rect(((i * 180 + t * 120) % 1440) - 80, 0, 24, 720).fill({
        color: 0xffffff,
        alpha: 0.12,
      });
  }

  private measure() {
    const now = performance.now();
    this.startedAt ||= now;
    const elapsed = now - this.startedAt;
    if (elapsed > WARMUP_MS && elapsed <= WARMUP_MS + MEASURE_MS && this.last) {
      this.intervals.push(now - this.last);
      this.cpu.push(now - this.frameStart);
    }
    this.last = now;
    if (elapsed > WARMUP_MS + MEASURE_MS && !this.game.mount.dataset.benchFps) this.report();
  }

  private report() {
    const mean = (list: number[]) => list.reduce((a, b) => a + b, 0) / list.length;
    const p95 = (list: number[]) =>
      [...list].sort((a, b) => a - b)[Math.floor(list.length * 0.95)]!;
    const fps = 1000 / mean(this.intervals);
    const data = this.game.mount.dataset;
    data.benchP95Ms = p95(this.intervals).toFixed(2);
    data.benchCpuMs = mean(this.cpu).toFixed(2);
    data.benchCpuP95Ms = p95(this.cpu).toFixed(2);
    data.benchFps = fps.toFixed(1);
    this.label.text = `${fps.toFixed(1)} fps · frame p95 ${data.benchP95Ms} ms · CPU ${data.benchCpuMs} ms`;
  }
}
