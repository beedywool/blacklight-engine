import { Container } from 'pixi.js';
import type { Game } from './game';

/**
 * Base class of every scene. A scene lives in `scenes/<name>/<name>.scene.ts` and is the default
 * export of that file; `P` types the parameters passed by `goto(name, params)`.
 *
 * @example
 * ```ts
 * export default class Title extends Scene {
 *   create() {
 *     this.add(new Text({ text: 'Press start' }));
 *   }
 *   update() {
 *     // runs at the fixed tick rate (60 Hz by default)
 *   }
 * }
 * ```
 */
export abstract class Scene<P = void> {
  /** The running game. Set before `create()` runs. */
  game!: Game;
  /** Scene name: its folder under `scenes/`. */
  name = '';
  /** Root display container, positioned in virtual pixels (0, 0 is the design area's top-left). */
  readonly stage = new Container();

  /** Called once when the scene starts, with the parameters given to `goto`. */
  create(_params: P): void | Promise<void> {}

  /** Called at every fixed logic step. */
  update(): void {}

  /**
   * Called once per displayed frame after the logic steps.
   * @param _alpha - Interpolation factor between the last step and the next, in [0, 1).
   */
  render(_alpha: number): void {}

  /** Called when the scene stops. Its stage and children are destroyed afterwards. */
  destroy(): void {}

  /** Design width in virtual pixels. */
  get width(): number {
    return this.game.config.resolution.width;
  }

  /** Design height in virtual pixels. */
  get height(): number {
    return this.game.config.resolution.height;
  }

  /** Adds a display object to the scene and returns it. */
  add<T extends Container>(child: T): T {
    this.stage.addChild(child);
    return child;
  }

  /** Stops this scene and starts another one. */
  goto(name: string, params?: unknown): Promise<void> {
    return this.game.goto(name, params);
  }
}
