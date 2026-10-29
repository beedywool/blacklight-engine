import { Application, Container, TextureStyle } from 'pixi.js';
import { resolveConfig, type GameConfig, type ResolvedGameConfig } from './config';
import { FixedStep } from './loop';
import type { Scene } from './scene';
import type { SceneLoader } from './scenes';
import { didYouMean } from './suggest';
import { computeViewport, type Viewport } from './viewport';

export interface CreateGameOptions {
  /** Scene loaders by name, usually from `scenesFromGlob(import.meta.glob(...))`. */
  scenes: Record<string, SceneLoader>;
  /** Element the game fills. */
  mount: HTMLElement;
}

/**
 * The running game: owns the renderer, the fixed-step loop and the current scene. Created by
 * {@link createGame}; scenes reach it through `this.game`.
 */
export class Game {
  readonly config: ResolvedGameConfig;
  readonly app = new Application();
  /** Holds the current scene's stage, scaled and offset to the viewport. */
  readonly world = new Container();
  viewport!: Viewport;
  /** Current scene, `undefined` while the first scene loads. */
  scene: Scene<never> | undefined;

  private readonly scenes: Record<string, SceneLoader>;
  private readonly mount: HTMLElement;
  private readonly steps: FixedStep;
  private paused = false;
  private switching: Promise<void> = Promise.resolve();

  constructor(config: ResolvedGameConfig, options: CreateGameOptions) {
    this.config = config;
    this.scenes = options.scenes;
    this.mount = options.mount;
    this.steps = new FixedStep(config.tickRate);
  }

  /** @internal Called by {@link createGame}. */
  async start(): Promise<void> {
    const { resolution } = this.config;
    if (resolution.pixelArt) TextureStyle.defaultOptions.scaleMode = 'nearest';
    await this.app.init({
      background: '#000000',
      antialias: !resolution.pixelArt,
      autoDensity: true,
      resolution: globalThis.devicePixelRatio || 1,
      roundPixels: resolution.pixelArt,
    });
    Object.assign(this.mount.style, {
      display: 'grid',
      placeItems: 'center',
      overflow: 'hidden',
      background: '#000',
    });
    document.title = this.config.name;
    this.app.canvas.style.display = 'block';
    this.mount.append(this.app.canvas);
    this.app.stage.addChild(this.world);
    this.layout();
    new ResizeObserver(() => this.layout()).observe(this.mount);

    if (this.config.pauseOnBlur) {
      document.addEventListener('visibilitychange', () => this.setPaused(document.hidden));
      window.addEventListener('blur', () => this.setPaused(true));
      window.addEventListener('focus', () => this.setPaused(false));
    }

    this.app.ticker.add((ticker) => {
      const scene = this.scene;
      if (!scene || this.paused) return;
      const alpha = this.steps.advance(ticker.deltaMS, () => scene.update());
      scene.render(alpha);
    });

    this.mount.dataset.blacklightState = 'loading';
    await this.goto(this.config.entry);
    this.mount.dataset.blacklightState = 'running';
  }

  /**
   * Stops the current scene and starts `name`. Calls made while a switch is in progress run after it.
   *
   * @throws Error when no scene has that name, with the closest names.
   */
  goto(name: string, params?: unknown): Promise<void> {
    this.switching = this.switching.then(() => this.switchTo(name, params));
    return this.switching;
  }

  /** Scene names known to the game. */
  get sceneNames(): string[] {
    return Object.keys(this.scenes);
  }

  private async switchTo(name: string, params: unknown): Promise<void> {
    const load = this.scenes[name];
    if (!load) {
      const known = this.sceneNames;
      throw new Error(
        `Unknown scene "${name}".${didYouMean(name, known)} Scenes live in scenes/<name>/<name>.scene.ts; known scenes: ${known.join(', ') || 'none'}.`,
      );
    }
    const { default: SceneClass } = await load();
    if (typeof SceneClass !== 'function') {
      throw new Error(
        `scenes/${name}/${name}.scene.ts must have a default export: \`export default class ... extends Scene\`.`,
      );
    }

    const previous = this.scene;
    if (previous) {
      this.scene = undefined;
      previous.destroy();
      this.world.removeChild(previous.stage);
      previous.stage.destroy({ children: true });
    }

    const scene = new SceneClass();
    scene.game = this;
    scene.name = name;
    this.world.addChild(scene.stage);
    await scene.create(params as never);
    this.steps.reset();
    this.scene = scene;
    this.mount.dataset.blacklightScene = name;
  }

  private setPaused(paused: boolean): void {
    if (this.paused === paused) return;
    this.paused = paused;
    if (!paused) this.steps.reset();
  }

  private layout(): void {
    const { clientWidth, clientHeight } = this.mount;
    if (clientWidth === 0 || clientHeight === 0) return;
    this.viewport = computeViewport(clientWidth, clientHeight, this.config.resolution);
    const { canvasWidth, canvasHeight, scale, originX, originY } = this.viewport;
    this.app.renderer.resize(canvasWidth, canvasHeight);
    this.world.scale.set(scale);
    this.world.position.set(originX, originY);
  }
}

/**
 * Validates the configuration, creates the renderer inside `mount` and starts the entry scene.
 * The CLI generates the call; games rarely call it themselves.
 *
 * @example
 * ```ts
 * const game = await createGame(config, {
 *   scenes: scenesFromGlob(import.meta.glob('./scenes/*\/*.scene.ts')),
 *   mount: document.getElementById('game')!,
 * });
 * ```
 */
export async function createGame(config: GameConfig, options: CreateGameOptions): Promise<Game> {
  const resolved = resolveConfig(config);
  if (!options.scenes[resolved.entry]) {
    const known = Object.keys(options.scenes);
    throw new Error(
      `The entry scene "${resolved.entry}" from game.config.ts does not exist.${didYouMean(resolved.entry, known)} Create scenes/${resolved.entry}/${resolved.entry}.scene.ts or change \`entry\`.`,
    );
  }
  const game = new Game(resolved, options);
  await game.start();
  return game;
}
