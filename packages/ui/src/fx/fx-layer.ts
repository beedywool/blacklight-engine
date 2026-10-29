import { Application, Container, type Filter } from 'pixi.js';
import type { Game, Transition } from '@blacklight/core';
import { prefersReducedMotion } from '../a11y';
import { createCover } from '../transitions';
import { createFxFilter, type FxFilter, type FxName } from './filters';

/** Where an effect applies. */
export type FxTarget = 'world' | 'overlay';

/** Options of {@link FxLayer.add}. */
export interface FxOptions {
  /** Final strength, 0–1. @defaultValue `1` */
  strength?: number;
  /** Fade-in duration in ms (real time). @defaultValue `0` */
  fade?: number;
  /**
   * `world`: the game canvas under the UI (scenes). `overlay`: the FX canvas above the UI, which
   * holds `<PixiRender>` content. @defaultValue `'world'`
   */
  target?: FxTarget;
}

/** An effect on the FX layer. */
export interface FxHandle {
  readonly filter: FxFilter | Filter;
  readonly target: FxTarget;
  /** Current strength (0–1). Setting it applies at once. */
  strength: number;
  /** Animates the strength in real time. */
  fadeTo(strength: number, ms: number): Promise<void>;
  /** Fades out (optionally) and removes the effect. */
  remove(fade?: number): Promise<void>;
}

interface Entry extends FxHandle {
  fade?: { from: number; to: number; start: number; ms: number; resolve(): void };
}

/** The canvas above the UI (created on first use): `<PixiRender>` sprites and overlay effects. */
export interface FxOverlay {
  readonly app: Application;
  /** Holds `<PixiRender>` sprites, in CSS pixels of the game's mount element. */
  readonly stage: Container;
}

/**
 * The FX layer (UI-11): WebGL effects synchronized with the DOM screens. Effects on the `world`
 * target filter the game canvas (scenes, under the UI); effects on the `overlay` target filter the
 * FX canvas above the UI, where `<PixiRender>` draws components that must go through a shader.
 * Built-in effects: `glitch`, `halftone`, `blur`, `chromatic`, `distort`; any Pixi `Filter` works
 * too. Reached as `uiOf(game).fx`, or `useFx()` in a screen (removed when the screen closes).
 *
 * @example
 * ```ts
 * const blur = uiOf(this.game).fx.add('blur', { strength: 0.6, fade: 200 });
 * await blur.remove(200);
 * await uiOf(this.game).fx.pulse('glitch', { duration: 500 });
 * ```
 */
export class FxLayer {
  private readonly entries: Entry[] = [];
  private overlayPromise: Promise<FxOverlay> | undefined;
  private overlayValue: FxOverlay | undefined;
  private warned = false;

  constructor(
    private readonly game: Game,
    /** Element the overlay canvas and covers are added to (the UI layer). */
    private readonly host: HTMLElement,
  ) {
    game.events.on('frame', ({ deltaMS }) => this.frame(deltaMS));
    game.events.on('resize', () => this.resizeOverlay());
  }

  /** Active effects, oldest first. */
  get active(): readonly FxHandle[] {
    return this.entries;
  }

  /** Adds an effect. */
  add(effect: FxName | Filter, options: FxOptions = {}): FxHandle {
    const filter = typeof effect === 'string' ? createFxFilter(effect) : effect;
    const target = options.target ?? 'world';
    if (this.game.app.renderer && this.game.app.renderer.name !== 'webgl' && !this.warned) {
      this.warned = true;
      console.warn(
        '[blacklight] FX effects use WebGL shaders; the WebGPU renderer shows them without effect.',
      );
    }
    const detach = (e: Entry) => this.detach(e);
    let level = 0;
    const entry: Entry = {
      filter,
      target,
      get strength() {
        return level;
      },
      set strength(value: number) {
        level = value;
        if ('strength' in filter) (filter as FxFilter).strength = value;
        else filter.enabled = value > 0;
      },
      fadeTo(to: number, ms: number) {
        entry.fade?.resolve();
        if (ms <= 0 || prefersReducedMotion()) {
          entry.strength = to;
          entry.fade = undefined;
          return Promise.resolve();
        }
        return new Promise<void>((resolve) => {
          entry.fade = { from: level, to, start: performance.now(), ms, resolve };
        });
      },
      async remove(fade = 0) {
        if (fade > 0) await entry.fadeTo(0, fade);
        detach(entry);
      },
    };
    const strength = options.strength ?? 1;
    entry.strength = options.fade ? 0 : strength;
    this.entries.push(entry);
    void this.attach(entry);
    if (options.fade) void entry.fadeTo(strength, options.fade);
    return entry;
  }

  /** Plays an effect up and down once (`# fx: glitch` in Ink). Resolves when it is gone. */
  async pulse(
    effect: FxName | Filter,
    options: FxOptions & { duration?: number } = {},
  ): Promise<void> {
    const duration = options.duration ?? 600;
    const handle = this.add(effect, { ...options, fade: duration * 0.25 });
    await new Promise((resolve) => setTimeout(resolve, duration * 0.5));
    await handle.remove(duration * 0.25);
  }

  /** Removes every effect at once. */
  clear(): void {
    for (const entry of [...this.entries]) this.detach(entry);
  }

  /** The canvas above the UI, created on first call. */
  overlay(): Promise<FxOverlay> {
    this.overlayPromise ??= this.createOverlay();
    return this.overlayPromise;
  }

  /**
   * A scene transition that bends the picture with the `distort` and `chromatic` effects while a
   * cover fades in. Registered as `distort` in `game.transitions`.
   */
  distortTransition(options: { color?: string; duration?: number } = {}): Transition {
    let cover: HTMLElement | undefined;
    let waves: FxHandle | undefined;
    let split: FxHandle | undefined;
    let last = 0;
    let revealing = false;
    return {
      duration: options.duration ?? 500,
      draw: (_layer, progress) => {
        if (!cover) {
          cover = createCover(this.host, options.color);
          waves = this.add('distort', { strength: 0 });
          split = this.add('chromatic', { strength: 0 });
          revealing = false;
          last = 0;
        }
        if (progress < last) revealing = true;
        last = progress;
        waves!.strength = progress * 1.6;
        split!.strength = progress * 1.2;
        cover.style.opacity = String(Math.min(1, Math.max(0, (progress - 0.55) / 0.45)));
        if (revealing && progress <= 0) {
          cover.remove();
          void waves!.remove();
          void split!.remove();
          cover = undefined;
        }
      },
    };
  }

  private frame(deltaMS: number): void {
    const now = performance.now();
    for (const entry of this.entries) {
      if ('time' in entry.filter) (entry.filter as FxFilter).time += deltaMS / 1000;
      const fade = entry.fade;
      if (!fade) continue;
      const t = Math.min(1, (now - fade.start) / fade.ms);
      entry.strength = fade.from + (fade.to - fade.from) * t;
      if (t >= 1) {
        entry.fade = undefined;
        fade.resolve();
      }
    }
  }

  private async attach(entry: Entry): Promise<void> {
    const container = entry.target === 'world' ? this.game.world : (await this.overlay()).stage;
    if (!this.entries.includes(entry)) return;
    container.filters = [...(container.filters ?? []), entry.filter];
  }

  private detach(entry: Entry): void {
    entry.fade?.resolve();
    const index = this.entries.indexOf(entry);
    if (index < 0) return;
    this.entries.splice(index, 1);
    const containers = [this.game.world, this.overlayValue?.stage].filter(
      (c): c is Container => !!c,
    );
    for (const container of containers) {
      const list = (container.filters ?? []) as Filter[];
      if (list.includes(entry.filter)) container.filters = list.filter((f) => f !== entry.filter);
    }
  }

  private async createOverlay(): Promise<FxOverlay> {
    const app = new Application();
    await app.init({
      backgroundAlpha: 0,
      antialias: true,
      autoDensity: true,
      resolution: globalThis.devicePixelRatio || 1,
      width: Math.max(1, this.game.mount.clientWidth),
      height: Math.max(1, this.game.mount.clientHeight),
      preference: 'webgl',
    });
    app.canvas.classList.add('bl-fx-overlay');
    this.host.append(app.canvas);
    const stage = new Container();
    app.stage.addChild(stage);
    this.overlayValue = { app, stage };
    return this.overlayValue;
  }

  private resizeOverlay(): void {
    const overlay = this.overlayValue;
    if (!overlay) return;
    overlay.app.renderer.resize(
      Math.max(1, this.game.mount.clientWidth),
      Math.max(1, this.game.mount.clientHeight),
    );
  }

  /** Removes the overlay canvas and every effect. */
  destroy(): void {
    this.clear();
    this.overlayValue?.app.destroy(true);
  }
}
