import type { Point, Rect } from './math';
import type { Random } from './random';

/** Options of {@link Camera.follow}. */
export interface FollowOptions {
  /** 0–1: share of the distance covered each step (1 = locked). @defaultValue `0.15` */
  lerp?: number;
  /** Area around the center where the target moves without moving the camera. */
  deadzone?: {
    /** Width of the dead zone in world pixels. */
    width: number;
    /** Height of the dead zone in world pixels. */
    height: number;
  };
  /** Offset added to the target position (look ahead, look up). */
  offset?: Point;
}

/** Something with a position, usually a game object. */
interface Followable {
  x: number;
  y: number;
  alive?: boolean;
}

/**
 * Shows part of a scene's world. `x` / `y` is the world point at the center of the view.
 * Scenes have one camera by default (`this.camera`); `addCamera` splits the screen.
 *
 * @example
 * ```ts
 * this.camera.follow(this.player, { lerp: 0.1 });
 * this.camera.bounds = { x: 0, y: 0, width: 4000, height: 1080 };
 * this.camera.shake(8, 300);
 * ```
 */
export class Camera {
  /** World x at the center of the view. */
  x: number;
  /** World y at the center of the view. */
  y: number;
  /** Magnification: 2 shows half as much of the world, twice as big. */
  zoom = 1;
  /** View rotation in radians. */
  rotation = 0;
  /** World area the view stays inside. */
  bounds: Rect | undefined;
  /**
   * Part of the screen this camera draws to, in fractions of the design size (`{ x: 0, y: 0,
   * width: 0.5, height: 1 }` is the left half).
   */
  viewport: Rect = { x: 0, y: 0, width: 1, height: 1 };
  private target: Followable | undefined;
  private followOptions: FollowOptions = {};
  private shakeIntensity = 0;
  private shakeLeft = 0;
  private shakeTotal = 0;
  /** Current shake offset, applied when drawing. */
  readonly shakeOffset: Point = { x: 0, y: 0 };

  constructor(
    /** Design size: the view size in world pixels at zoom 1 is this times the viewport fraction. */
    private readonly design: () => { width: number; height: number },
    private readonly random: () => Random,
    /** Visible size at zoom 1 (larger than the design size in `extend` mode); used by `bounds`. */
    private readonly visible: () => { width: number; height: number } = design,
  ) {
    const { width, height } = design();
    this.x = width / 2;
    this.y = height / 2;
  }

  /** View size in world pixels. */
  get viewWidth(): number {
    return (this.visible().width * this.viewport.width) / this.zoom;
  }
  /** View height in world pixels. */
  get viewHeight(): number {
    return (this.visible().height * this.viewport.height) / this.zoom;
  }

  /** Visible world rectangle. */
  get view(): Rect {
    return {
      x: this.x - this.viewWidth / 2,
      y: this.y - this.viewHeight / 2,
      width: this.viewWidth,
      height: this.viewHeight,
    };
  }

  /** Follows `target` every step until `unfollow()`. */
  follow(target: Followable, options: FollowOptions = {}): void {
    this.target = target;
    this.followOptions = options;
  }

  /** Object followed, if any. */
  get following(): Followable | undefined {
    return this.target;
  }

  /** Options of the current `follow`. */
  get followSettings(): FollowOptions {
    return this.followOptions;
  }

  /** Stops following; the camera stays where it is. */
  unfollow(): void {
    this.target = undefined;
  }

  /** Centers on a point now. */
  centerOn(x: number, y: number): void {
    this.x = x;
    this.y = y;
    this.clamp();
  }

  /** Shakes by up to `intensity` world pixels, fading over `duration` ms. */
  shake(intensity: number, duration = 250): void {
    this.shakeIntensity = Math.max(
      this.shakeIntensity * (this.shakeLeft / (this.shakeTotal || 1)),
      intensity,
    );
    this.shakeLeft = this.shakeTotal = duration;
  }

  /** Screen point (virtual px of the design area) → world point. */
  toWorld(screen: Point): Point {
    const { width, height } = this.design();
    const vx = this.viewport.x * width;
    const vy = this.viewport.y * height;
    const cx = vx + (this.viewport.width * width) / 2;
    const cy = vy + (this.viewport.height * height) / 2;
    const dx = (screen.x - cx) / this.zoom;
    const dy = (screen.y - cy) / this.zoom;
    const cos = Math.cos(-this.rotation);
    const sin = Math.sin(-this.rotation);
    return { x: this.x + dx * cos - dy * sin, y: this.y + dx * sin + dy * cos };
  }

  /** World point → screen point (virtual px of the design area). */
  toScreen(world: Point): Point {
    const { width, height } = this.design();
    const cx = this.viewport.x * width + (this.viewport.width * width) / 2;
    const cy = this.viewport.y * height + (this.viewport.height * height) / 2;
    const dx = world.x - this.x;
    const dy = world.y - this.y;
    const cos = Math.cos(this.rotation);
    const sin = Math.sin(this.rotation);
    return { x: cx + (dx * cos - dy * sin) * this.zoom, y: cy + (dx * sin + dy * cos) * this.zoom };
  }

  /** @internal Called once per fixed step. */
  step(dtMs: number): void {
    const target = this.target;
    if (target && target.alive !== false) {
      const { lerp = 0.15, deadzone, offset } = this.followOptions;
      const tx = target.x + (offset?.x ?? 0);
      const ty = target.y + (offset?.y ?? 0);
      let goalX = tx;
      let goalY = ty;
      if (deadzone) {
        const hw = deadzone.width / 2;
        const hh = deadzone.height / 2;
        goalX = tx > this.x + hw ? tx - hw : tx < this.x - hw ? tx + hw : this.x;
        goalY = ty > this.y + hh ? ty - hh : ty < this.y - hh ? ty + hh : this.y;
      }
      this.x += (goalX - this.x) * lerp;
      this.y += (goalY - this.y) * lerp;
    }
    this.clamp();
    if (this.shakeLeft > 0) {
      this.shakeLeft = Math.max(0, this.shakeLeft - dtMs);
      const power = this.shakeIntensity * (this.shakeLeft / this.shakeTotal);
      const random = this.random();
      this.shakeOffset.x = random.float(-power, power);
      this.shakeOffset.y = random.float(-power, power);
    } else {
      this.shakeOffset.x = this.shakeOffset.y = 0;
    }
  }

  private clamp(): void {
    const b = this.bounds;
    if (!b) return;
    const hw = this.viewWidth / 2;
    const hh = this.viewHeight / 2;
    this.x =
      b.width <= hw * 2
        ? b.x + b.width / 2
        : Math.min(Math.max(this.x, b.x + hw), b.x + b.width - hw);
    this.y =
      b.height <= hh * 2
        ? b.y + b.height / 2
        : Math.min(Math.max(this.y, b.y + hh), b.y + b.height - hh);
  }
}
