import {
  Container as PixiContainer,
  Graphics as PixiGraphics,
  RenderTexture,
  Sprite as PixiSprite,
} from 'pixi.js';
import { resolveProjectPath } from './assets';
import type { PlayOptions, SoundHandle } from './audio';
import type { Behavior } from './behaviors/behavior';
import { Camera, type FollowOptions } from './camera';
import { CollisionWorld, type CollisionState, type RaycastHit } from './collision/world';
import type { WorldShape } from './collision/shapes';
import { Disposables, EventBus, type EventMap, type Unsubscribe } from './events';
import type { Game, GotoOptions, SceneUi } from './game';
import type { InputManager } from './input/input';
import { loadLayout, type SceneLayout } from './layout';
import type { Point, Rect } from './math';
import { Text } from './objects/basic';
import { GameObject, type GameObjectClass, type SpawnProps } from './objects/game-object';
import { Sprite } from './objects/sprite';
import { Random } from './random';
import type { AssetKey, ObjectName, SceneName } from './register';
import { nameOf } from './registry';
import { applyFields, decode, encode, encodeFields, type Encoded } from './serialize';
import { didYouMean } from './suggest';
import { Timers, type TimersState } from './timers';
import { Tweens, type Tween, type TweenOptions } from './tween';

/** The pointer in this scene's world coordinates (through the main camera). */
export interface ScenePointer extends Point {
  /** Position on screen, in virtual pixels of the design area. */
  screen: Point;
  /** The button (or finger) is held. */
  down: boolean;
  /** The button went down during this step. */
  pressed: boolean;
  /** The button went up during this step. */
  released: boolean;
}

/** Saved state of one object, part of a {@link SceneSnapshot}. */
export interface ObjectSnapshot {
  /** The object's id in its scene, kept on restore. */
  id: number;
  /** Registered name of the object's class, used to re-create it. */
  type: string;
  /** Id of the parent object, `undefined` when the object sits on a layer. */
  parent: number | undefined;
  /** Layer the object sits on (`'hud'` included), `undefined` when it has a parent object. */
  layer: string | undefined;
  /** State every game object has. */
  core: {
    /** Position, in world pixels. */
    x: number;
    /** Position, in world pixels. */
    y: number;
    /** Rotation, in radians. */
    rotation: number;
    /** Horizontal scale. */
    scaleX: number;
    /** Vertical scale. */
    scaleY: number;
    /** Opacity, 0 to 1. */
    alpha: number;
    /** Whether the object is drawn. */
    visible: boolean;
    /** Draw order inside its layer. */
    zIndex: number;
    /** Velocity, in pixels per second. */
    vx: number;
    /** Velocity, in pixels per second. */
    vy: number;
    /** Local player number (1–8) whose input the object reads. */
    player: number;
    /** The object's tags. */
    tags: string[];
    /** The hitbox, encoded. */
    hitbox: Encoded;
    /** Collision settings (layer, mask, solid…), encoded. */
    collision: Encoded;
  };
  /** Engine state of the object's class (text, flips…). */
  state: Record<string, Encoded>;
  /** The game's own fields (`static serialize`, or every own field), encoded. */
  data: Record<string, Encoded>;
  /** State of each behavior, in the object's order. */
  behaviors: {
    /** Whether the behavior runs. */
    enabled: boolean;
    /** The behavior's own fields, encoded. */
    data: Record<string, Encoded>;
  }[];
  /** Animation state of sprites with an animation sheet. */
  animation?: {
    /** Playing animation. */
    name: string | undefined;
    /** Current frame of the animation. */
    index: number;
    /** Milliseconds spent on the current frame. */
    elapsed: number;
    /** Whether a non-looping animation reached its end. */
    finished: boolean;
    /** Whether the frames are mirrored horizontally. */
    flipX: boolean;
    /** Playback speed multiplier. */
    speed: number;
  };
}

/**
 * Saved state of a scene (RT-19). JSON-safe except `memory`, which holds timers and is only
 * valid in the same session (rollback).
 */
export interface SceneSnapshot {
  /** Name of the scene. */
  scene: string;
  /** Fixed steps run since `create()`. */
  steps: number;
  /** Id the next spawned object gets. */
  nextId: number;
  /** State of the scene's random generator. */
  random: [number, number, number, number];
  /** Every camera, main camera first. */
  cameras: {
    /** Position, in world pixels. */
    x: number;
    /** Position, in world pixels. */
    y: number;
    /** Zoom factor. */
    zoom: number;
    /** Rotation, in radians. */
    rotation: number;
    /** Part of the screen the camera draws to, in fractions of the design size. */
    viewport: Rect;
    /** World area the camera stays inside, `null` when unbounded. */
    bounds: Rect | null;
    /** Id of the followed object. */
    follow: number | undefined;
    /** How the camera follows it. */
    followOptions: FollowOptions;
  }[];
  /** Every living object, in spawn order. */
  objects: ObjectSnapshot[];
  /** Timers and collision memory: functions and live references, valid in this session only. */
  memory?: {
    /** The scene's timers. */
    timers: TimersState;
    /** Each object's timers, by object id. */
    objectTimers: Map<number, TimersState>;
    /** Which pairs were touching, for enter and leave events. */
    collisions?: CollisionState;
  };
}

/** Audio bound to a scene: keys are looked up in the scene's folder first. */
export interface SceneAudio {
  /** Plays a sound effect by key (`'coin'`) or path. */
  play(key: AssetKey, options?: PlayOptions): SoundHandle;
  /** Starts a music track, replacing the current one (cross-faded with `fade`). */
  music(key: AssetKey, options?: Omit<PlayOptions, 'bus' | 'at'>): SoundHandle;
  /** Stops the music, fading out over `fade` milliseconds. */
  stopMusic(options?: { fade?: number }): void;
}

/**
 * Base class of every scene. A scene lives in `scenes/<name>/<name>.scene.ts` and is the default
 * export of that file; `P` types the parameters passed by `goto(name, params)`.
 *
 * @example
 * ```ts
 * export default class Battle extends Scene<{ enemy?: string }> {
 *   static assets = ['./assets/arena.png', '@assets/music/battle.ogg'];
 *   player!: Player;
 *
 *   create() {
 *     this.player = this.spawn(Player, { x: 320, y: 540 });
 *     this.audio.music('battle', { fade: 800 });
 *   }
 *   update() {
 *     if (this.input.pressed('pause')) this.game.overlay('pause');
 *   }
 * }
 * ```
 */
export abstract class Scene<P = void> {
  /** Files preloaded before `create()`, relative to the scene folder; a path ending with `/` loads a whole folder. */
  static assets: string[] | undefined;
  /** Draw layers of the world, back to front. `'hud'` is always available and ignores cameras. */
  static layers: string[] = ['main'];
  /** World size: `onLeave`, `destroyOutsideLayout` and the default camera bounds. Defaults to the design size, without bounds. */
  static size:
    | {
        /** World width, in pixels. */
        width: number;
        /** World height, in pixels. */
        height: number;
      }
    | undefined;

  /** The running game. */
  game!: Game;
  /** Scene name (its folder). */
  name = '';
  /** Root display container. */
  readonly stage = new PixiContainer();
  /** World container, moved by the camera; holds the layers. */
  readonly world = new PixiContainer();
  /** Screen-space container drawn above the world (scores, HUD). */
  readonly hud = new PixiContainer();
  /** Events of this scene, for the game's own messages; listeners go away with the scene. */
  readonly events = new EventBus<EventMap>();
  /** Timers on the game clock; prefer {@link Scene.after} and {@link Scene.every}. */
  readonly timers = new Timers();
  /** Running tweens; prefer {@link Scene.tween}. */
  readonly tweens = new Tweens();
  /** Collision detection between the scene's objects: queries, raycasts, solid tiles. */
  readonly collisions: CollisionWorld;
  /** Cleanups run when the scene ends; add unsubscribe functions and handles to it. */
  readonly disposables = new Disposables();
  /** Scene random generator, seeded from the game's. */
  random = new Random(0);
  /** Every camera, main camera first; see {@link Scene.addCamera}. */
  readonly cameras: Camera[] = [];
  /** Fixed steps run since `create()`. */
  steps = 0;
  /**
   * Called every step after the objects and before collision detection; packages such as
   * `@blacklight/physics` step their world here.
   */
  readonly afterObjects = new Set<(dt: number) => void>();
  /** Scenes hosted inside this one. */
  readonly hosted: Scene<never>[] = [];
  /** The scene hosting this one, if any. */
  host: Scene<never> | undefined;
  /** Rectangle in the host's HUD, for hosted scenes. */
  hostRect: Rect | undefined;

  private readonly objectList: GameObject[] = [];
  private readonly layerMap = new Map<string, PixiContainer>();
  private readonly view = new PixiContainer();
  private nextId = 1;
  private split: { camera: Camera; texture: RenderTexture; sprite: PixiSprite }[] = [];
  private cameraPrev: Point[] = [];
  private sceneAudio: SceneAudio | undefined;

  constructor() {
    this.collisions = new CollisionWorld(() => this.objectList);
  }

  /** Called once when the scene starts, with the parameters given to `goto`. */
  create(_params: P): void | Promise<void> {}

  /** Called at every fixed step, before the objects. */
  update(): void {}

  /**
   * Called once per displayed frame after the logic steps.
   * @param _alpha - Interpolation factor between the last step and the next, in [0, 1).
   */
  render(_alpha: number): void {}

  /** Called when the scene stops. Its objects are destroyed afterwards. */
  destroy(): void {}

  /** Design width in virtual pixels (the host rectangle for hosted scenes). */
  get width(): number {
    return this.hostRect?.width ?? this.game.config.resolution.width;
  }

  /** Design height in virtual pixels. */
  get height(): number {
    return this.hostRect?.height ?? this.game.config.resolution.height;
  }

  /** World area used for `onLeave` and object culling. */
  get bounds(): Rect {
    const size = (this.constructor as typeof Scene).size;
    return { x: 0, y: 0, width: size?.width ?? this.width, height: size?.height ?? this.height };
  }

  /** The main camera. */
  get camera(): Camera {
    return this.cameras[0]!;
  }

  /** The game's input: actions, keys, gamepads, pointer (same as `game.input`). */
  get input(): InputManager {
    return this.game.input;
  }

  /**
   * Screens of this scene (`@blacklight/ui`): `this.ui.open(Hud)`, `this.ui.push('PauseMenu')`.
   * They close when the scene ends.
   */
  get ui(): SceneUi {
    if (!this.game.ui) {
      throw new Error(
        'No UI layer: add @blacklight/ui to the game (`pnpm add @blacklight/ui vue`).',
      );
    }
    return this.game.ui.forScene(this as Scene<never>);
  }

  /** Sound and music; keys are looked up in this scene's folder first. */
  get audio(): SceneAudio {
    const prefer = [`scenes/${this.name}`];
    this.sceneAudio ??= {
      play: (key, options) => this.game.audio.play(key, options, prefer),
      music: (key, options) => this.game.audio.music(key, options, prefer),
      stopMusic: (options) => this.game.audio.stopMusic(options),
    };
    return this.sceneAudio;
  }

  /** Pointer in world coordinates of the main camera. */
  get pointer(): ScenePointer {
    const p = this.game.input.pointer;
    const screen = this.hostRect
      ? { x: p.x - this.hostRect.x, y: p.y - this.hostRect.y }
      : { x: p.x, y: p.y };
    const world = this.camera.toWorld(screen);
    return { ...world, screen, down: p.down, pressed: p.pressed, released: p.released };
  }

  /** Living objects in spawn order. */
  get objects(): readonly GameObject[] {
    return this.objectList;
  }

  /** The container of a layer (`'hud'` for screen space). */
  layer(name: string): PixiContainer {
    if (name === 'hud') return this.hud;
    const layer = this.layerMap.get(name);
    if (!layer) {
      throw new Error(
        `Unknown layer "${name}".${didYouMean(name, this.layerMap.keys())} Declare it in \`static layers\` of the scene.`,
      );
    }
    return layer;
  }

  /**
   * Creates an object and adds it to the scene. `Type` is a class or a registered name; names
   * defined in this scene's `objects/` folder shadow global ones.
   *
   * @example
   * ```ts
   * const coin = this.spawn(Coin, { x: 200, y: 300 });
   * this.spawn('Shadow', { x: 900, y: 540, layer: 'enemies' });
   * ```
   */
  spawn<T extends GameObject>(Type: GameObjectClass<T> | (new () => T), props?: SpawnProps<T>): T;
  spawn(Type: ObjectName, props?: SpawnProps<GameObject> & Record<string, unknown>): GameObject;
  spawn(Type: string | (new () => GameObject), props: Record<string, unknown> = {}): GameObject {
    const Class = typeof Type === 'string' ? this.game.objectClass(Type, this.name) : Type;
    const object = new Class();
    const { layer, parent, ...rest } = props as { layer?: string; parent?: GameObject };
    this.applyProps(object, rest);
    return this.add(object, { layer, parent });
  }

  /**
   * Spawns the objects placed in a layout file (`<name>.layout.json`, saved by the VS Code scene
   * editor), in order. Returns them.
   *
   * @example
   * ```ts
   * import layout from './level.layout.json';
   * create() {
   *   this.load(layout);
   *   this.player = this.find('Player')!;
   * }
   * ```
   */
  load(layout: SceneLayout): GameObject[] {
    return loadLayout(this as Scene<never>, layout);
  }

  /** Spawns `count` objects; `props` receives the index. */
  spawnMany<T extends GameObject>(
    Type: GameObjectClass<T> | (new () => T),
    count: number,
    props: (index: number) => SpawnProps<T>,
  ): T[] {
    return Array.from({ length: count }, (_, i) => this.spawn(Type, props(i)));
  }

  private applyProps(object: GameObject, props: Record<string, unknown>): void {
    for (const [key, value] of Object.entries(props)) {
      if (key === 'scale') {
        if (typeof value === 'number') object.scale.set(value);
        else object.scale.set((value as Point).x, (value as Point).y);
      } else if (key === 'velocity') {
        object.velocity.copy(value as Point);
      } else {
        (object as unknown as Record<string, unknown>)[key] = value;
      }
    }
  }

  /**
   * Adds an object created with `new` (spawn does this for you). Children of `parent` move with it.
   */
  add<T extends GameObject>(object: T, options: { layer?: string; parent?: GameObject } = {}): T {
    const container = options.parent ?? this.layer(options.layer ?? this.defaultLayer);
    container.addChild(object);
    this.attach(object);
    return object;
  }

  private attach(object: GameObject, create = true): void {
    object.scene = this as Scene<never>;
    object.game = this.game;
    if (!object.id) object.id = this.nextId++;
    else this.nextId = Math.max(this.nextId, object.id + 1);
    object.prevX = object.x;
    object.prevY = object.y;
    this.objectList.push(object);
    this.game.rememberClass(object.constructor as typeof GameObject);
    if (object instanceof Sprite && !object.animator)
      object.initSheet(this.game.sheets.get(object.constructor as typeof Sprite));
    if (object instanceof Text) object.setScreenResolution(this.game.textResolution);
    const type = object.constructor as typeof GameObject;
    if (object.behaviors.length === 0)
      for (const spec of type.behaviors ?? []) object.behaviors.push(spec());
    for (const behavior of object.behaviors) (behavior as unknown as Behavior).attach(object);
    // Children added before the object joined the scene join with it.
    for (const child of object.children)
      if (child instanceof GameObject && !child.scene) this.attach(child, create);
    if (create) object.create();
  }

  /** @internal Called by `GameObject.destroy`. */
  forget(object: GameObject): void {
    const index = this.objectList.indexOf(object);
    if (index >= 0) this.objectList.splice(index, 1);
    this.collisions.remove(object);
    this.tweens.stopTweensOf(object);
  }

  /** First object with that name, tag or class. */
  find<T extends GameObject = GameObject>(
    what: ObjectName | (string & {}) | (abstract new (...args: never[]) => T),
  ): T | undefined {
    return this.objectList.find((o) => o.alive && o.is(what as string)) as T | undefined;
  }

  /** Every object with that name, tag or class. */
  findAll<T extends GameObject = GameObject>(
    what: ObjectName | (string & {}) | (abstract new (...args: never[]) => T),
  ): T[] {
    return this.objectList.filter((o) => o.alive && o.is(what as string)) as T[];
  }

  /** Object with that id. */
  byId(id: number): GameObject | undefined {
    return this.objectList.find((o) => o.id === id);
  }

  /** Runs `callback` after `ms` of game time, unless the scene ends first. */
  after(ms: number, callback: () => void): Unsubscribe {
    return this.timers.after(ms, callback);
  }

  /** Runs `callback` every `ms` of game time while the scene runs. */
  every(ms: number, callback: () => void): Unsubscribe {
    return this.timers.every(ms, callback);
  }

  /** Animates numeric properties of any object on the game clock. */
  tween(target: object, to: Record<string, number>, options?: TweenOptions): Tween {
    return this.tweens.add(target, to, options);
  }

  /** Listens to a bus until the scene ends. */
  listen<E extends object, K extends keyof E>(
    bus: EventBus<E>,
    name: K,
    listener: (payload: E[K]) => void,
  ): Unsubscribe {
    return this.disposables.add(bus.on(name, listener));
  }

  /** First object or solid tile hit by the segment. */
  raycast(
    from: Point,
    to: Point,
    filter?: (object: GameObject) => boolean,
  ): RaycastHit | undefined {
    return this.collisions.raycast(from, to, filter);
  }

  /** Objects overlapping a shape. */
  query(shape: WorldShape, filter?: (object: GameObject) => boolean): GameObject[] {
    return this.collisions.query(shape, filter);
  }

  /** Stops this scene and starts another one (from the top-level scene). */
  goto(name: SceneName, params?: unknown, options?: GotoOptions): Promise<void> {
    return this.game.goto(name, params, options);
  }

  /**
   * Runs another scene inside this one, in a rectangle of this scene's HUD (virtual pixels).
   * The hosted scene has its own camera and objects and is updated with this one.
   */
  async hostScene(name: SceneName, rect: Rect, params?: unknown): Promise<Scene<never>> {
    const scene = await this.game.instantiate(name);
    scene.host = this as Scene<never>;
    scene.hostRect = { ...rect };
    const frame = new PixiContainer();
    frame.position.set(rect.x, rect.y);
    const mask = new PixiGraphics().rect(0, 0, rect.width, rect.height).fill(0xffffff);
    frame.addChild(mask, scene.stage);
    scene.stage.mask = mask;
    this.hud.addChild(frame);
    this.hosted.push(scene);
    await scene.start(params);
    return scene;
  }

  /** Stops a hosted scene. */
  closeHosted(scene: Scene<never>): void {
    const index = this.hosted.indexOf(scene);
    if (index < 0) return;
    this.hosted.splice(index, 1);
    const frame = scene.stage.parent;
    scene.dispose();
    frame?.destroy({ children: true });
  }

  /**
   * Adds a camera drawing to part of the screen (fractions of the design size). With more than
   * one camera the screen is split; up to 4.
   */
  addCamera(viewport: Rect): Camera {
    if (this.cameras.length >= 4) throw new Error('A scene has at most 4 cameras.');
    const camera = this.makeCamera();
    camera.viewport = { ...viewport };
    this.cameras.push(camera);
    return camera;
  }

  /** Removes a camera added with {@link Scene.addCamera}. The main camera is never removed. */
  removeCamera(camera: Camera): void {
    if (this.cameras.length <= 1) return;
    const index = this.cameras.indexOf(camera);
    if (index >= 0) this.cameras.splice(index, 1);
  }

  /** Captures the state of every object, the random generator and the cameras (RT-19). */
  snapshot(): SceneSnapshot {
    const objectTimers = new Map<number, TimersState>();
    const objects = this.objectList
      .filter((o) => o.alive)
      .map<ObjectSnapshot>((o) => {
        objectTimers.set(o.id, o.timers.capture());
        const type = o.constructor as typeof GameObject;
        const keys = type.serialize ?? Object.keys(o).filter((k) => !o.engineKeys.has(k));
        const parent = o.parent instanceof GameObject ? o.parent.id : undefined;
        const layer =
          parent === undefined
            ? ([...this.layerMap].find(([, c]) => c === o.parent)?.[0] ??
              (o.parent === this.hud ? 'hud' : undefined))
            : undefined;
        return {
          id: o.id,
          type: nameOf(type),
          parent,
          layer,
          core: {
            x: o.x,
            y: o.y,
            rotation: o.rotation,
            scaleX: o.scale.x,
            scaleY: o.scale.y,
            alpha: o.alpha,
            visible: o.visible,
            zIndex: o.zIndex,
            vx: o.velocity.x,
            vy: o.velocity.y,
            player: o.player,
            tags: [...o.tags],
            hitbox: encode(o.hitbox),
            collision: encode(o.collision),
          },
          data: encodeFields(o, keys),
          state: o.snapshotState(),
          behaviors: o.behaviors.map((b) => ({
            enabled: b.enabled,
            data: encodeFields(
              b,
              Object.keys(b).filter(
                (k) => !['name', 'options', 'object', 'enabled', 'ownsMovement'].includes(k),
              ),
            ),
          })),
          animation:
            o instanceof Sprite && o.animator
              ? {
                  name: o.animator.name,
                  index: o.animator.index,
                  elapsed: o.animator.elapsed,
                  finished: o.animator.finished,
                  flipX: o.animator.flipX,
                  speed: o.animator.speed,
                }
              : undefined,
        };
      });
    return {
      scene: this.name,
      steps: this.steps,
      nextId: this.nextId,
      random: this.random.state,
      cameras: this.cameras.map((c) => ({
        x: c.x,
        y: c.y,
        zoom: c.zoom,
        rotation: c.rotation,
        viewport: { ...c.viewport },
        bounds: c.bounds ? { ...c.bounds } : null,
        follow: c.following instanceof GameObject ? c.following.id : undefined,
        followOptions: JSON.parse(JSON.stringify(c.followSettings)) as FollowOptions,
      })),
      objects,
      memory: {
        timers: this.timers.capture(),
        objectTimers,
        collisions: this.collisions.capture(),
      },
    };
  }

  /**
   * Returns to a snapshot: objects that did not exist are destroyed, missing ones re-created
   * (without calling `create()`), and every saved field restored.
   */
  restore(snapshot: SceneSnapshot): void {
    if (snapshot.scene !== this.name) {
      throw new Error(
        `This snapshot is of scene "${snapshot.scene}"; it cannot be restored into "${this.name}".`,
      );
    }
    const created = new Set<GameObject>();
    const wanted = new Set(snapshot.objects.map((o) => o.id));
    for (const object of [...this.objectList])
      if (!wanted.has(object.id) && object.alive) object.destroy();
    const byId = new Map(this.objectList.map((o) => [o.id, o]));
    const ordered = [...snapshot.objects].sort(
      (a, b) => (a.parent === undefined ? 0 : 1) - (b.parent === undefined ? 0 : 1),
    );
    for (const saved of ordered) {
      let object = byId.get(saved.id);
      if (object && nameOf(object.constructor as typeof GameObject) !== saved.type) {
        object.destroy();
        object = undefined;
      }
      if (!object) {
        const Class = this.game.objectClass(saved.type, this.name);
        object = new Class();
        object.id = saved.id;
        const parent = saved.parent !== undefined ? byId.get(saved.parent) : undefined;
        (parent ?? this.layer(saved.layer ?? this.defaultLayer)).addChild(object);
        this.attach(object, false);
        byId.set(saved.id, object);
        created.add(object);
      }
    }
    const lookup = (id: number) => byId.get(id);
    for (const saved of snapshot.objects) {
      const o = byId.get(saved.id)!;
      const c = saved.core;
      o.teleport(c.x, c.y);
      o.rotation = c.rotation;
      o.scale.set(c.scaleX, c.scaleY);
      o.alpha = c.alpha;
      o.visible = c.visible;
      o.zIndex = c.zIndex;
      o.velocity.set(c.vx, c.vy);
      o.player = c.player;
      o.tags.clear();
      for (const tag of c.tags) o.tags.add(tag);
      o.hitbox = decode(c.hitbox, lookup) as GameObject['hitbox'];
      o.collision = decode(c.collision, lookup) as GameObject['collision'];
      applyFields(o, saved.data, lookup);
      o.restoreState(saved.state);
      if (created.has(o)) o.onRestore?.();
      saved.behaviors.forEach((b, i) => {
        const behavior = o.behaviors[i];
        if (!behavior) return;
        behavior.enabled = b.enabled;
        applyFields(behavior, b.data, lookup);
      });
      if (saved.animation && o instanceof Sprite && o.animator) {
        const a = saved.animation;
        if (a.name) o.animator.play(a.name, true);
        Object.assign(o.animator, {
          index: a.index,
          elapsed: a.elapsed,
          finished: a.finished,
          flipX: a.flipX,
          speed: a.speed,
        });
        o.syncFrame();
      }
      const timers = snapshot.memory?.objectTimers.get(saved.id);
      if (timers) o.timers.restore(timers);
    }
    // Same update order and ids as when the snapshot was taken: re-created objects were appended,
    // and objects spawned after a rollback must get the ids they had the first time.
    const order = new Map(snapshot.objects.map((o, i) => [o.id, i]));
    this.objectList.sort((a, b) => (order.get(a.id) ?? 0) - (order.get(b.id) ?? 0));
    this.steps = snapshot.steps;
    this.nextId = snapshot.nextId;
    this.random.state = [...snapshot.random];
    snapshot.cameras.forEach((saved, i) => {
      const camera = this.cameras[i] ?? this.addCamera(saved.viewport);
      const { follow, followOptions, bounds, ...rest } = saved;
      Object.assign(camera, rest);
      camera.bounds = bounds ?? undefined;
      const target = follow !== undefined ? byId.get(follow) : undefined;
      if (target) camera.follow(target, followOptions);
      else camera.unfollow();
    });
    while (this.cameras.length > snapshot.cameras.length) this.removeCamera(this.cameras.at(-1)!);
    if (snapshot.memory) this.timers.restore(snapshot.memory.timers);
    if (snapshot.memory?.collisions) this.collisions.restore(snapshot.memory.collisions, lookup);
  }

  // Engine side.

  /** @internal Sets up containers and cameras; called before `create()`. */
  init(game: Game, name: string): void {
    this.game = game;
    this.name = name;
    this.random = new Random(game.random.int(0, 2 ** 31));
    this.cosmetic = new Random(`${name}:${this.random.state.join(',')}`);
    for (const layer of (this.constructor as typeof Scene).layers) {
      const container = new PixiContainer({ sortableChildren: true, label: layer });
      this.layerMap.set(layer, container);
      this.world.addChild(container);
    }
    this.view.addChild(this.world);
    this.stage.addChild(this.view, this.hud);
    this.cameras.push(this.makeCamera());
  }

  /** Random generator for cosmetic effects (camera shake), so they do not shift `random`. */
  private cosmetic = new Random(0);

  private makeCamera(): Camera {
    const camera = new Camera(
      () => ({ width: this.width, height: this.height }),
      () => this.cosmetic,
      () => {
        const v = this.game.viewport;
        // Split screens render the design area of each viewport; one camera shows the whole visible area.
        return this.hostRect || !v || this.cameras.length > 1
          ? { width: this.width, height: this.height }
          : { width: v.visibleWidth, height: v.visibleHeight };
      },
    );
    const size = (this.constructor as typeof Scene).size;
    if (size) camera.bounds = { x: 0, y: 0, width: size.width, height: size.height };
    return camera;
  }

  /** Layer used when `spawn` / `add` get none: `'main'` when declared, else the first layer. */
  get defaultLayer(): string {
    const layers = (this.constructor as typeof Scene).layers;
    return layers.includes('main') ? 'main' : (layers[0] ?? 'main');
  }

  /** @internal Parameters given to `create()`; hot reload creates the new version with them. */
  params: unknown;

  /** @internal Runs `create()`. */
  async start(params: unknown): Promise<void> {
    this.params = params;
    await this.create(params as P);
  }

  /** @internal One fixed step. */
  step(dt: number): void {
    this.steps++;
    this.cameraPrev = this.cameras.map((c) => ({ x: c.x, y: c.y }));
    for (const object of this.objectList) {
      object.prevX = object.x;
      object.prevY = object.y;
    }
    this.timers.advance(dt * 1000);
    this.update();
    for (const object of [...this.objectList]) if (object.alive) object.step(dt);
    for (const hook of this.afterObjects) hook(dt);
    this.collisions.step(this.bounds);
    this.tweens.step(dt * 1000);
    for (const camera of this.cameras) camera.step(dt * 1000);
    this.game.audio.updateListener({ x: this.camera.x, y: this.camera.y });
    for (const scene of [...this.hosted]) scene.step(dt);
  }

  /** @internal Draws one frame. */
  draw(alpha: number): void {
    const round = this.game.config.resolution.pixelArt;
    for (const object of this.objectList) object.interpolate(alpha, round);
    this.render(alpha);
    if (this.cameras.length === 1) {
      this.clearSplit();
      if (this.world.parent !== this.view) this.view.addChildAt(this.world, 0);
      this.placeWorld(this.camera, 0, alpha, 0, 0);
    } else {
      this.drawSplit(alpha);
    }
    for (const scene of this.hosted) scene.draw(alpha);
  }

  private placeWorld(
    camera: Camera,
    index: number,
    alpha: number,
    originX: number,
    originY: number,
  ): void {
    const prev = this.cameraPrev[index] ?? camera;
    let x = prev.x + (camera.x - prev.x) * alpha + camera.shakeOffset.x;
    let y = prev.y + (camera.y - prev.y) * alpha + camera.shakeOffset.y;
    if (this.game.config.resolution.pixelArt) {
      x = Math.round(x * camera.zoom) / camera.zoom;
      y = Math.round(y * camera.zoom) / camera.zoom;
    }
    this.world.pivot.set(x, y);
    this.world.scale.set(camera.zoom);
    this.world.rotation = camera.rotation;
    this.world.position.set(
      originX + (camera.viewport.width * this.width) / 2,
      originY + (camera.viewport.height * this.height) / 2,
    );
  }

  private drawSplit(alpha: number): void {
    if (this.world.parent) this.world.parent.removeChild(this.world);
    const renderer = this.game.app.renderer;
    const resolution = renderer.resolution * (this.game.viewport?.scale ?? 1);
    if (
      this.split.length !== this.cameras.length ||
      this.split.some((s, i) => s.camera !== this.cameras[i])
    ) {
      this.clearSplit();
      this.split = this.cameras.map((camera) => {
        const texture = RenderTexture.create({
          width: Math.max(1, camera.viewport.width * this.width),
          height: Math.max(1, camera.viewport.height * this.height),
          resolution,
        });
        const sprite = new PixiSprite(texture);
        sprite.position.set(camera.viewport.x * this.width, camera.viewport.y * this.height);
        this.view.addChild(sprite);
        return { camera, texture, sprite };
      });
    }
    this.split.forEach(({ camera, texture }, i) => {
      this.placeWorld(camera, i, alpha, 0, 0);
      renderer.render({ container: this.world, target: texture, clear: true });
    });
  }

  private clearSplit(): void {
    for (const { texture, sprite } of this.split) {
      sprite.destroy();
      texture.destroy(true);
    }
    this.split = [];
  }

  /** @internal Stops the scene: user `destroy()`, objects, listeners, display. */
  dispose(): void {
    this.game.ui?.sceneEnded(this as Scene<never>);
    for (const scene of [...this.hosted]) this.closeHosted(scene);
    this.destroy();
    for (const object of [...this.objectList]) object.destroy();
    this.timers.clear();
    this.tweens.clear();
    this.events.clear();
    this.disposables.dispose();
    this.clearSplit();
    this.world.destroy({ children: true });
    this.stage.destroy({ children: true });
  }

  /** @internal Resolves `static assets` entries to project paths. */
  static assetPaths(type: typeof Scene, name: string, all: string[]): string[] {
    const base = `scenes/${name}`;
    const out = new Set<string>();
    for (const file of all) if (file.startsWith(`${base}/assets/`)) out.add(file);
    for (const entry of type.assets ?? []) {
      const path = resolveProjectPath(entry, base);
      if (entry.endsWith('/')) {
        for (const file of all) if (file.startsWith(`${path}/`)) out.add(file);
      } else if (all.includes(path)) {
        out.add(path);
      } else {
        const variants = all.filter((f) => f.slice(0, f.lastIndexOf('.')) === path);
        if (variants.length === 0)
          throw new Error(
            `scenes/${name}: \`static assets\` lists "${entry}" but there is no file at ${path}.${didYouMean(path, all)}`,
          );
        for (const v of variants) out.add(v);
      }
    }
    return [...out];
  }
}
