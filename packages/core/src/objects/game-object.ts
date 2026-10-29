import { Container as PixiContainer, type DestroyOptions } from 'pixi.js';
import type { AnyBehavior, Behavior, BehaviorSpec } from '../behaviors/behavior';
import type { CollisionSpec, Contact, MoveResult, Side } from '../collision/world';
import {
  collide,
  toWorld,
  type HitboxSpec,
  type Transform,
  type WorldShape,
} from '../collision/shapes';
import { Disposables, type EventBus, type Unsubscribe } from '../events';
import type { Game } from '../game';
import type { PlayerInput } from '../input/input';
import { Vector2 } from '../math';
import type { ObjectName } from '../register';
import { nameOf } from '../registry';
import type { Encoded } from '../serialize';
import type { Scene } from '../scene';
import { Timers } from '../timers';
import type { Tween, TweenOptions } from '../tween';

/** Properties accepted by `spawn(Class, props)`: any public field of the object. */
export type SpawnProps<T> = {
  [K in keyof T as T[K] extends (...args: never[]) => unknown ? never : K]?: T[K] extends Vector2
    ? { x: number; y: number }
    : T[K];
} & {
  /** Scene layer to add the object to. */
  layer?: string;
  /** Uniform scale or per-axis scale. */
  scale?: number | { x: number; y: number };
};

/** Class of a game object, as passed to `spawn`. */
export type GameObjectClass<T extends GameObject = GameObject> = (new () => T) & typeof GameObject;

const ENGINE_KEYS = Symbol('blacklight.engineKeys');

/**
 * Base class of everything placed in a scene. Positions are in virtual pixels; speeds in virtual
 * pixels per second. Subclass it (or `Sprite`, `Text`…) and override `update()`.
 *
 * Logic runs on `x` / `y`; the display is interpolated between fixed steps, so read and write
 * `x` / `y`, not `position`.
 *
 * @example
 * ```ts
 * export default class Coin extends Sprite {
 *   static behaviors = [behaviors.sineWave({ property: 'y', amplitude: 6, period: 1 })];
 *   static collision = { layer: 'pickup' };
 *   value = 10;
 * }
 * ```
 */
export class GameObject extends PixiContainer {
  /** Behaviors attached to every instance. */
  static behaviors: BehaviorSpec[] | undefined;
  /** Collision shape. @defaultValue `'none'` (`'auto'` for sprites) */
  static hitbox: HitboxSpec = 'none';
  /** Collision layer, mask and solidity. */
  static collision: CollisionSpec | undefined;
  /** Tags tested by `is()`. */
  static tags: string[] | undefined;
  /** Extra files to preload with the object, relative to its folder. */
  static assets: string[] | undefined;
  /**
   * Files an engine class needs besides `static assets` (the model of a `Model3D`), relative to
   * the object's folder. Preloaded with the scene like `static assets`.
   */
  static requiredAssets(): string[] {
    return [];
  }
  /** Fields saved in snapshots; by default every data field the class declares. */
  static serialize: string[] | undefined;
  /** Registry name (PascalCase folder name), set when the object is discovered. */
  static objectName: string | undefined;
  /** Project folder of the object (`objects/player`), set when the object is discovered. */
  static objectPath: string | undefined;

  declare private _lx: number;
  declare private _ly: number;
  /** Position at the start of the current step, for display interpolation. */
  declare prevX: number;
  declare prevY: number;

  /** Unique id within the scene, stable across snapshots. */
  id = 0;
  /** `false` once destroyed. */
  alive = true;
  /** Speed in virtual pixels per second, applied each step unless a behavior moves the object. */
  readonly velocity = new Vector2();
  /** Local player number (1–8) whose input `this.input` reads. */
  player = 1;
  readonly tags = new Set<string>();
  readonly behaviors: AnyBehavior[] = [];
  hitbox: HitboxSpec;
  collision: CollisionSpec;
  /** Timers bound to the object: they stop when it is destroyed. */
  readonly timers = new Timers();
  readonly disposables = new Disposables();
  scene!: Scene<never>;
  game!: Game;

  constructor() {
    super();
    const type = this.constructor as typeof GameObject;
    this.hitbox = type.hitbox;
    this.collision = { ...type.collision };
    for (const tag of type.tags ?? []) this.tags.add(tag);
    this.label = nameOf(type);
    this.markEngineKeys();
  }

  /**
   * Records the fields that exist so far as engine fields, so snapshots only save the fields the
   * game's subclass adds. Engine subclasses call it at the end of their constructor.
   */
  protected markEngineKeys(): void {
    (this as unknown as Record<symbol, Set<string>>)[ENGINE_KEYS] = new Set(Object.keys(this));
  }

  /** @internal */
  get engineKeys(): ReadonlySet<string> {
    return (this as unknown as Record<symbol, Set<string>>)[ENGINE_KEYS] ?? new Set();
  }

  override get x(): number {
    return this._lx ?? 0;
  }
  override set x(value: number) {
    this._lx = value;
    this.position.x = value;
  }
  override get y(): number {
    return this._ly ?? 0;
  }
  override set y(value: number) {
    this._ly = value;
    this.position.y = value;
  }

  /** Moves without display interpolation (no sliding from the previous position). */
  teleport(x: number, y: number): void {
    this.x = this.prevX = x;
    this.y = this.prevY = y;
  }

  /** Registry name of the object's class. */
  get objectName(): string {
    return nameOf(this.constructor as typeof GameObject);
  }

  /** Called once after spawning, with the spawn properties already applied. */
  create(): void {}

  /** Called at every fixed step, after the behaviors. */
  update(): void {}

  /** Called when the object is destroyed. */
  onDestroy?(): void;
  /**
   * Called instead of `create()` when `scene.restore()` re-creates the object, after its fields
   * are restored: rebuild what `create()` set up from those fields.
   */
  onRestore?(): void;

  /** @internal Engine state of the class that is not a plain field (text, flips…). */
  snapshotState(): Record<string, Encoded> {
    return {};
  }

  /** @internal */
  restoreState(_state: Record<string, Encoded>): void {}
  /** Called when this object starts overlapping another one. */
  onCollide?(other: GameObject, contact: Contact): void;
  /** Called when this object stops overlapping `other`. */
  onCollideEnd?(other: GameObject): void;
  /** Called when the object goes fully outside the scene bounds. */
  onLeave?(side: Side): void;

  /**
   * `true` when the object's class (or a parent class) has that registry name, the object has that
   * tag, or it is an instance of that class.
   */
  is(what: ObjectName | (string & {}) | (abstract new (...args: never[]) => GameObject)): boolean {
    if (typeof what === 'function') return this instanceof what;
    if (this.tags.has(what)) return true;
    for (
      let type = this.constructor as typeof GameObject;
      type && type !== GameObject;
      type = Object.getPrototypeOf(type)
    ) {
      if (nameOf(type) === what) return true;
    }
    return false;
  }

  /** `true` when `other` is inside this object (child, grandchild…). */
  isAncestorOf(other: PixiContainer): boolean {
    for (let parent = other.parent; parent; parent = parent.parent)
      if (parent === this) return true;
    return false;
  }

  /** Input of `this.player`. */
  get input(): PlayerInput {
    return this.game.input.player(this.player);
  }

  /** Attaches a behavior. */
  addBehavior<B extends AnyBehavior>(behavior: B | (() => B)): B {
    const instance = typeof behavior === 'function' ? behavior() : behavior;
    this.behaviors.push(instance);
    if (this.scene) (instance as unknown as Behavior).attach(this);
    return instance;
  }

  /** Detaches a behavior. */
  removeBehavior(behavior: AnyBehavior): void {
    const index = this.behaviors.indexOf(behavior);
    if (index < 0) return;
    this.behaviors.splice(index, 1);
    (behavior as unknown as Behavior).detach(this);
  }

  /** First attached behavior with that name or class. */
  behavior<B extends AnyBehavior>(
    which: string | (abstract new (...args: never[]) => B),
  ): B | undefined {
    return this.behaviors.find((b) =>
      typeof which === 'string' ? b.name === which : b instanceof which,
    ) as B | undefined;
  }

  /** Runs `callback` after `ms` of game time, unless the object is destroyed first. */
  after(ms: number, callback: () => void): Unsubscribe {
    return this.timers.after(ms, callback);
  }

  /** Runs `callback` every `ms` of game time while the object exists. */
  every(ms: number, callback: () => void): Unsubscribe {
    return this.timers.every(ms, callback);
  }

  /** Animates numeric properties of this object (`x`, `alpha`, `scale.x`…). */
  tween(to: Record<string, number>, options?: TweenOptions): Tween {
    return this.scene.tweens.add(this, to, options);
  }

  /** Listens to a bus until the object is destroyed. */
  listen<E extends object, K extends keyof E>(
    bus: EventBus<E>,
    name: K,
    listener: (payload: E[K]) => void,
  ): Unsubscribe {
    return this.disposables.add(bus.on(name, listener));
  }

  /**
   * Moves by (dx, dy) and stops at solid objects and tiles. `climb` lets the object walk up slopes
   * (pixels up per pixel sideways).
   */
  move(dx: number, dy: number, climb = 0): MoveResult {
    return this.scene.collisions.move(this, dx, dy, climb);
  }

  /** Objects this object currently overlaps. */
  get contacts(): GameObject[] {
    return [...this.scene.collisions.contactsOf(this).keys()];
  }

  /** `true` when the two objects overlap right now. */
  overlaps(other: GameObject): boolean {
    const a = this.worldShape();
    const b = other.worldShape();
    return !!a && !!b && collide(a, b) !== undefined;
  }

  /** Transform from this object's space to scene space, from logical positions. */
  sceneTransform(): Transform {
    const chain: GameObject[] = [this];
    for (let node = this.parent; node; node = node.parent) {
      if (node instanceof GameObject) chain.push(node);
    }
    let t: Transform = { x: 0, y: 0, rotation: 0, scaleX: 1, scaleY: 1 };
    for (let i = chain.length - 1; i >= 0; i--) {
      const node = chain[i]!;
      const cos = Math.cos(t.rotation);
      const sin = Math.sin(t.rotation);
      const px = node.x * t.scaleX;
      const py = node.y * t.scaleY;
      t = {
        x: t.x + px * cos - py * sin,
        y: t.y + px * sin + py * cos,
        rotation: t.rotation + node.rotation,
        scaleX: t.scaleX * node.scale.x,
        scaleY: t.scaleY * node.scale.y,
      };
    }
    return t;
  }

  /** Hitbox in local space for `'auto'`. Sprites return their frame; others their bounds. */
  protected autoHitbox(): Exclude<HitboxSpec, 'auto' | 'none' | 'pixel'> | undefined {
    const b = this.getLocalBounds();
    if (b.width <= 0 || b.height <= 0) return undefined;
    return { type: 'box', x: b.x, y: b.y, width: b.width, height: b.height };
  }

  /** Pixel hitbox data; only sprites provide it. */
  protected pixelHitbox(): Parameters<typeof toWorld>[0] | undefined {
    return undefined;
  }

  /** The object's collision shape in scene space, or `undefined` without hitbox. */
  worldShape(): WorldShape | undefined {
    const spec = this.currentHitbox();
    if (spec === 'none') return undefined;
    const local =
      spec === 'auto' ? this.autoHitbox() : spec === 'pixel' ? this.pixelHitbox() : spec;
    return local && toWorld(local, this.sceneTransform());
  }

  /** Hitbox in effect now; sprites override it with per-frame hitboxes. */
  protected currentHitbox(): HitboxSpec {
    return this.hitbox;
  }

  /** @internal Runs one fixed step: behaviors, update, velocity, timers. */
  step(dt: number): void {
    let moved = false;
    for (const behavior of this.behaviors) {
      if (!behavior.enabled || !this.alive) continue;
      (behavior as unknown as Behavior).update(this, dt);
      moved ||= behavior.ownsMovement;
    }
    if (!this.alive) return;
    this.update();
    if (!this.alive) return;
    if (!moved && (this.velocity.x !== 0 || this.velocity.y !== 0)) {
      this.move(this.velocity.x * dt, this.velocity.y * dt);
    }
    this.stepInternal(dt);
    this.timers.advance(dt * 1000);
  }

  /** @internal Engine subclasses advance their own state here (animations). */
  protected stepInternal(_dt: number): void {}

  /** @internal Display interpolation between the previous and current step. */
  interpolate(alpha: number, round: boolean): void {
    const px = this.prevX ?? this.x;
    const py = this.prevY ?? this.y;
    let x = px + (this.x - px) * alpha;
    let y = py + (this.y - py) * alpha;
    if (round) {
      x = Math.round(x);
      y = Math.round(y);
    }
    this.position.set(x, y);
  }

  /** Removes the object from its scene and frees it. Safe to call more than once. */
  override destroy(options?: DestroyOptions): void {
    if (!this.alive) return;
    this.alive = false;
    this.onDestroy?.();
    for (const behavior of [...this.behaviors]) (behavior as unknown as Behavior).detach(this);
    this.timers.clear();
    this.disposables.dispose();
    this.scene?.forget(this);
    super.destroy(
      typeof options === 'object' ? { children: true, ...options } : { children: true },
    );
  }
}
