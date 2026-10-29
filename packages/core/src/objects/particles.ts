import { Graphics as PixiGraphics, Particle, ParticleContainer, type Texture } from 'pixi.js';
import { DEG, lerp } from '../math';
import { IMAGE_EXTENSIONS } from '../assets';
import type { AssetKey } from '../register';
import { GameObject } from './game-object';

type Range = number | [number, number];

export interface EmitterOptions {
  /** Particle image; a soft white dot when omitted. */
  texture?: AssetKey;
  /** Particles per second while emitting. @defaultValue `20` */
  rate?: number;
  /** Lifetime in ms. @defaultValue `[600, 1000]` */
  lifetime?: Range;
  /** Initial speed in px/s. @defaultValue `[60, 120]` */
  speed?: Range;
  /** Emission direction in degrees (0 = right, 90 = down). @defaultValue `[0, 360]` */
  angle?: Range;
  /** Acceleration in px/s². */
  gravity?: { x: number; y: number };
  /** Scale at birth and at death. @defaultValue `[1, 1]` */
  scale?: [number, number];
  /** Alpha at birth and at death. @defaultValue `[1, 0]` */
  alpha?: [number, number];
  /** Tint, or tint at birth and at death. */
  tint?: number | [number, number];
  /** Spin in degrees per second. */
  spin?: Range;
  /** Spawn area around the emitter: a radius or a rectangle size. */
  area?: number | { width: number; height: number };
  /** Most particles alive at once. @defaultValue `500` */
  max?: number;
  /** Additive blending for glows and sparks. */
  additive?: boolean;
  /** Emit as soon as spawned. @defaultValue `true` */
  emitting?: boolean;
}

interface Live {
  particle: Particle;
  vx: number;
  vy: number;
  age: number;
  life: number;
  spin: number;
}

let dotTexture: Texture | undefined;

/**
 * Particle emitter: sparks, smoke, confetti. Randomness comes from the scene's seeded generator,
 * so effects replay the same way.
 *
 * @example
 * ```ts
 * const sparks = this.spawn(Particles, { x: 320, y: 200 });
 * sparks.configure({ rate: 0, speed: [120, 260], tint: [0xffd60a, 0xff5500], additive: true });
 * sparks.burst(40);
 * ```
 */
export class Particles extends GameObject {
  options: EmitterOptions = {};
  emitting = true;
  readonly container = new ParticleContainer({
    dynamicProperties: { position: true, rotation: true, vertex: true, color: true },
  });
  private live: Live[] = [];
  private debt = 0;

  constructor() {
    super();
    this.addChild(this.container);
    this.markEngineKeys();
  }

  override create(): void {
    this.configure(this.options);
  }

  override onRestore(): void {
    this.create();
  }

  override snapshotState() {
    return { options: JSON.parse(JSON.stringify(this.options)), emitting: this.emitting };
  }

  override restoreState(state: Record<string, unknown>): void {
    this.options = state.options as EmitterOptions;
    this.emitting = !!state.emitting;
  }

  /** Replaces the emitter options. */
  configure(options: EmitterOptions): this {
    this.options = options;
    this.emitting = options.emitting ?? this.emitting;
    this.container.blendMode = options.additive ? 'add' : 'normal';
    return this;
  }

  /** Number of living particles. */
  get count(): number {
    return this.live.length;
  }

  /** Emits `count` particles at once. */
  burst(count: number): void {
    for (let i = 0; i < count; i++) this.spawnParticle();
  }

  private texture(): Texture {
    if (this.options.texture) {
      const path = this.game.assets.find(this.options.texture, {
        baseDir: (this.constructor as typeof Particles).objectPath,
        preferDirs: [`scenes/${this.scene.name}`],
        extensions: IMAGE_EXTENSIONS,
      })[0]!;
      return this.game.assets.texture(path);
    }
    if (!dotTexture) {
      const dot = new PixiGraphics().circle(8, 8, 8).fill({ color: 0xffffff });
      dotTexture = this.game.app.renderer.generateTexture(dot);
      dot.destroy();
    }
    return dotTexture;
  }

  private range(value: Range | undefined, fallback: [number, number]): number {
    const [min, max] =
      value === undefined ? fallback : typeof value === 'number' ? [value, value] : value;
    return this.scene.random.float(min, max);
  }

  private spawnParticle(): void {
    if (this.live.length >= (this.options.max ?? 500)) return;
    const o = this.options;
    const angle = this.range(o.angle, [0, 360]) * DEG;
    const speed = this.range(o.speed, [60, 120]);
    let x = 0;
    let y = 0;
    if (typeof o.area === 'number') {
      const a = this.scene.random.float(0, Math.PI * 2);
      const r = Math.sqrt(this.scene.random.next()) * o.area;
      x = Math.cos(a) * r;
      y = Math.sin(a) * r;
    } else if (o.area) {
      x = this.scene.random.float(-o.area.width / 2, o.area.width / 2);
      y = this.scene.random.float(-o.area.height / 2, o.area.height / 2);
    }
    const particle = new Particle({ texture: this.texture(), x, y, anchorX: 0.5, anchorY: 0.5 });
    this.container.addParticle(particle);
    this.live.push({
      particle,
      vx: Math.cos(angle) * speed,
      vy: Math.sin(angle) * speed,
      age: 0,
      life: this.range(o.lifetime, [600, 1000]),
      spin: this.range(o.spin, [0, 0]) * DEG,
    });
  }

  protected override stepInternal(dt: number): void {
    const o = this.options;
    if (this.emitting && (o.rate ?? 20) > 0) {
      this.debt += (o.rate ?? 20) * dt;
      while (this.debt >= 1) {
        this.spawnParticle();
        this.debt--;
      }
    }
    const [s0, s1] = o.scale ?? [1, 1];
    const [a0, a1] = o.alpha ?? [1, 0];
    const tint = o.tint;
    const survivors: Live[] = [];
    for (const p of this.live) {
      p.age += dt * 1000;
      if (p.age >= p.life) {
        this.container.removeParticle(p.particle);
        continue;
      }
      const t = p.age / p.life;
      p.vx += (o.gravity?.x ?? 0) * dt;
      p.vy += (o.gravity?.y ?? 0) * dt;
      p.particle.x += p.vx * dt;
      p.particle.y += p.vy * dt;
      p.particle.rotation += p.spin * dt;
      const scale = lerp(s0, s1, t);
      p.particle.scaleX = p.particle.scaleY = scale;
      p.particle.alpha = lerp(a0, a1, t);
      if (tint !== undefined)
        p.particle.tint = typeof tint === 'number' ? tint : mixColor(tint[0], tint[1], t);
      survivors.push(p);
    }
    this.live = survivors;
  }
}

function mixColor(a: number, b: number, t: number): number {
  const r = Math.round(lerp((a >> 16) & 255, (b >> 16) & 255, t));
  const g = Math.round(lerp((a >> 8) & 255, (b >> 8) & 255, t));
  const bl = Math.round(lerp(a & 255, b & 255, t));
  return (r << 16) | (g << 8) | bl;
}
