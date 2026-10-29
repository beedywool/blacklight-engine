import RAPIER from '@dimforge/rapier2d-compat';
import { Behavior, type GameObject, type Scene, type HitboxSpec } from '@blacklight/core';

// Rapier ships as WebAssembly; it is ready before any scene that imports this package starts.
await RAPIER.init();

export interface PhysicsWorldOptions {
  /** px/s². @defaultValue `{ x: 0, y: 980 }` */
  gravity?: { x: number; y: number };
  /** Pixels per physics meter: Rapier is tuned for objects of 0.1–10 m. @defaultValue `50` */
  pixelsPerMeter?: number;
}

export interface BodyOptions {
  /** `dynamic` moves under forces, `fixed` never moves, `kinematic` follows `x` / `y` set by code. @defaultValue `'dynamic'` */
  type?: 'dynamic' | 'fixed' | 'kinematic';
  /** Collider; defaults to the object's hitbox (box, circle or polygon). */
  shape?: Exclude<HitboxSpec, 'auto' | 'none' | 'pixel'>;
  /** kg/m². @defaultValue `1` */
  density?: number;
  /** @defaultValue `0.5` */
  friction?: number;
  /** Bounciness 0–1. @defaultValue `0` */
  restitution?: number;
  /** Never rotates (characters). */
  fixedRotation?: boolean;
  linearDamping?: number;
  angularDamping?: number;
  /** Reports collisions without pushing. */
  sensor?: boolean;
  /** Continuous collision detection for fast objects. */
  ccd?: boolean;
}

interface WorldState {
  world: RAPIER.World;
  events: RAPIER.EventQueue;
  ppm: number;
  colliders: Map<number, GameObject>;
  bodies: Set<RigidBody>;
}

const worlds = new WeakMap<Scene<never>, WorldState>();
const settings = new WeakMap<Scene<never>, PhysicsWorldOptions>();

/** Sets the physics world of a scene (call in `create()` before spawning bodies). */
export function configurePhysics(scene: Scene<never>, options: PhysicsWorldOptions): void {
  if (worlds.has(scene))
    throw new Error('configurePhysics must run before the first body is created in the scene.');
  settings.set(scene, options);
}

function worldOf(scene: Scene<never>): WorldState {
  let state = worlds.get(scene);
  if (!state) {
    const options = settings.get(scene) ?? {};
    const ppm = options.pixelsPerMeter ?? 50;
    const gravity = options.gravity ?? { x: 0, y: 980 };
    state = {
      world: new RAPIER.World({ x: gravity.x / ppm, y: gravity.y / ppm }),
      events: new RAPIER.EventQueue(true),
      ppm,
      colliders: new Map(),
      bodies: new Set(),
    };
    state.world.timestep = scene.game.time.dt;
    worlds.set(scene, state);
    // One world step per scene step, after every object (and kinematic body) has moved.
    const step = () => stepWorld(state!);
    scene.afterObjects.add(step);
    scene.disposables.add(() => {
      scene.afterObjects.delete(step);
      state!.world.free();
      state!.events.free();
      worlds.delete(scene);
    });
  }
  return state;
}

/** Advances a world one step, moves the objects of dynamic bodies and dispatches contacts. */
function stepWorld(state: WorldState): void {
  state.world.step(state.events);
  for (const body of state.bodies) body.sync();
  state.events.drainCollisionEvents((a, b, started) => {
    const first = state.colliders.get(a);
    const second = state.colliders.get(b);
    if (!first?.alive || !second?.alive) return;
    if (started) {
      first.onCollide?.(second, { other: second, penetration: { nx: 0, ny: 0, depth: 0 } });
      second.onCollide?.(first, { other: first, penetration: { nx: 0, ny: 0, depth: 0 } });
    } else {
      first.onCollideEnd?.(second);
      second.onCollideEnd?.(first);
    }
  });
}

/**
 * A Rapier rigid body driving the object: forces, impulses, stacking, joints-free physics.
 *
 * @example
 * ```ts
 * import { physics } from '@blacklight/physics';
 *
 * export default class Crate extends Sprite {
 *   static behaviors = [physics.body({ density: 2, friction: 0.8 })];
 * }
 * ```
 */
export class RigidBody extends Behavior<BodyOptions> {
  readonly name = 'rigidBody';
  override readonly ownsMovement = true;
  body!: RAPIER.RigidBody;
  collider!: RAPIER.Collider;
  private state!: WorldState;

  override attach(object: GameObject): void {
    super.attach(object);
    const state = (this.state = worldOf(object.scene));
    const o = this.options;
    const ppm = state.ppm;
    const desc =
      o.type === 'fixed'
        ? RAPIER.RigidBodyDesc.fixed()
        : o.type === 'kinematic'
          ? RAPIER.RigidBodyDesc.kinematicPositionBased()
          : RAPIER.RigidBodyDesc.dynamic();
    desc.setTranslation(object.x / ppm, object.y / ppm).setRotation(object.rotation);
    if (o.fixedRotation) desc.lockRotations();
    if (o.ccd) desc.setCcdEnabled(true);
    if (o.linearDamping !== undefined) desc.setLinearDamping(o.linearDamping);
    if (o.angularDamping !== undefined) desc.setAngularDamping(o.angularDamping);
    desc.setLinvel(object.velocity.x / ppm, object.velocity.y / ppm);
    this.body = state.world.createRigidBody(desc);

    const shape = o.shape ?? (typeof object.hitbox === 'object' ? object.hitbox : undefined);
    const sx = Math.abs(object.scale.x);
    const sy = Math.abs(object.scale.y);
    let collider: RAPIER.ColliderDesc | null;
    if (shape?.type === 'circle') {
      collider = RAPIER.ColliderDesc.ball((shape.radius * Math.max(sx, sy)) / ppm).setTranslation(
        ((shape.x ?? 0) * sx) / ppm,
        ((shape.y ?? 0) * sy) / ppm,
      );
    } else if (shape?.type === 'polygon') {
      collider = RAPIER.ColliderDesc.convexHull(
        new Float32Array(shape.points.flatMap(([x, y]) => [(x * sx) / ppm, (y * sy) / ppm])),
      );
    } else {
      const box = shape?.type === 'box' ? shape : boundsBox(object);
      collider = RAPIER.ColliderDesc.cuboid(
        (box.width * sx) / 2 / ppm,
        (box.height * sy) / 2 / ppm,
      ).setTranslation(
        (((box.x ?? 0) + box.width / 2) * sx) / ppm,
        (((box.y ?? 0) + box.height / 2) * sy) / ppm,
      );
    }
    if (!collider)
      throw new Error(`${object.objectName}: could not build a physics collider from its hitbox.`);
    collider
      .setDensity(o.density ?? 1)
      .setFriction(o.friction ?? 0.5)
      .setRestitution(o.restitution ?? 0)
      .setSensor(!!o.sensor)
      .setActiveEvents(RAPIER.ActiveEvents.COLLISION_EVENTS);
    this.collider = state.world.createCollider(collider, this.body);
    state.colliders.set(this.collider.handle, object);
    state.bodies.add(this);
    // Rapier reports this object's contacts; hitbox overlap events would repeat them.
    object.collision.events = false;
  }

  override update(object: GameObject): void {
    if (this.options.type !== 'kinematic') return;
    const ppm = this.state.ppm;
    this.body.setNextKinematicTranslation({ x: object.x / ppm, y: object.y / ppm });
    this.body.setNextKinematicRotation(object.rotation);
  }

  /** @internal Copies the body's position to the object after a world step. */
  sync(): void {
    if (this.options.type === 'kinematic' || !this.object.alive) return;
    const ppm = this.state.ppm;
    const p = this.body.translation();
    this.object.x = p.x * ppm;
    this.object.y = p.y * ppm;
    this.object.rotation = this.body.rotation();
    const v = this.body.linvel();
    this.object.velocity.set(v.x * ppm, v.y * ppm);
  }

  override detach(): void {
    if (!worlds.has(this.object.scene)) return;
    this.state.colliders.delete(this.collider.handle);
    this.state.bodies.delete(this);
    this.state.world.removeRigidBody(this.body);
  }

  /** Instant push, in px/s × mass. */
  applyImpulse(x: number, y: number): void {
    this.body.applyImpulse({ x: x / this.state.ppm, y: y / this.state.ppm }, true);
  }

  /** Sets the velocity in px/s. */
  setVelocity(x: number, y: number): void {
    this.body.setLinvel({ x: x / this.state.ppm, y: y / this.state.ppm }, true);
  }

  /** Moves the body (and the object) to a point now. */
  teleport(x: number, y: number): void {
    this.body.setTranslation({ x: x / this.state.ppm, y: y / this.state.ppm }, true);
    this.object.teleport(x, y);
  }
}

function boundsBox(object: GameObject): { x: number; y: number; width: number; height: number } {
  const b = object.getLocalBounds();
  return b.width > 0
    ? { x: b.x, y: b.y, width: b.width, height: b.height }
    : { x: -8, y: -8, width: 16, height: 16 };
}

/** Physics behaviors for `static behaviors`. */
export const physics = {
  body:
    (options: BodyOptions = {}) =>
    () =>
      new RigidBody(options),
};

export { RAPIER };
