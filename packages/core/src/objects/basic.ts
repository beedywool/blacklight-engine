import {
  BitmapText,
  Graphics as PixiGraphics,
  Sprite as PixiSprite,
  Text as PixiText,
  Texture,
  type TextStyleOptions,
} from 'pixi.js';
import { VIDEO_EXTENSIONS } from '../assets';
import type { HitboxSpec } from '../collision/shapes';
import type { AssetKey } from '../register';
import { GameObject } from './game-object';

/**
 * An empty object that groups others: move, rotate or fade them together.
 *
 * @example
 * ```ts
 * import { Container } from '@blacklight/core';
 *
 * // Inside a scene: a ship made of parts (the game's Hull and Turret objects) that turn together.
 * const ship = this.spawn(Container, { x: 400, y: 300 });
 * ship.addChild(this.spawn(Hull), this.spawn(Turret));
 * ship.rotation = Math.PI / 4;
 * ```
 */
export class Container extends GameObject {}

/** Options of the {@link Text} constructor; the same fields can be passed to `spawn(Text, …)`. */
export interface TextOptions {
  /** Initial text. @defaultValue `''` */
  text?: string;
  /** Pixi text style: `fontFamily`, `fontSize`, `fill`, `align`… */
  style?: TextStyleOptions;
  /** Draw from a bitmap font (an `.fnt` file's family, or generated from a web font). */
  bitmap?: boolean;
}

/**
 * Text drawn with web fonts (any family loaded from `assets/`, by file name) or bitmap fonts.
 * Text stays sharp at every scale: its resolution follows the screen.
 *
 * @example
 * ```ts
 * const score = this.spawn(Text, { text: '0', style: { fontFamily: 'pixellita', fontSize: 32, fill: 0xffffff } });
 * score.text = String(points);
 * ```
 */
export class Text extends GameObject {
  /** Use bitmap fonts for every instance of the class. */
  static bitmap = false;
  /** The displayed Pixi text, replaced when `bitmap` changes. */
  view: PixiText | BitmapText;

  constructor(options: TextOptions = {}) {
    super();
    const bitmap = options.bitmap ?? (this.constructor as typeof Text).bitmap;
    const init = { text: options.text ?? '', style: options.style };
    this.view = bitmap ? new BitmapText(init) : new PixiText(init);
    this.view.anchor.set(0.5);
    this.addChild(this.view);
    this.markEngineKeys();
  }

  /** Draws from a bitmap font instead of a web font (settable at spawn). */
  get bitmap(): boolean {
    return this.view instanceof BitmapText;
  }
  set bitmap(value: boolean) {
    if (value === this.bitmap) return;
    const old = this.view;
    this.view = value
      ? new BitmapText({ text: old.text, style: old.style })
      : new PixiText({ text: old.text, style: old.style });
    this.view.anchor.copyFrom(old.anchor);
    this.addChildAt(this.view, this.getChildIndex(old));
    old.destroy();
  }

  /** Displayed text; numbers are converted to strings. */
  get text(): string {
    return this.view.text;
  }
  set text(value: string | number) {
    this.view.text = String(value);
  }

  /** Pixi text style (`fontFamily`, `fontSize`, `fill`…); assign an object to change several. */
  get style() {
    return this.view.style;
  }
  set style(value: TextStyleOptions) {
    this.view.style = value;
  }

  /** Anchor (0–1), centered by default. */
  get anchor() {
    return this.view.anchor;
  }

  override snapshotState() {
    return { text: this.text };
  }

  override restoreState(state: Record<string, unknown>): void {
    if (typeof state.text === 'string') this.text = state.text;
  }

  /** @internal Called by the game when the screen scale changes. */
  setScreenResolution(resolution: number): void {
    if (this.view instanceof PixiText && this.view.resolution !== resolution)
      this.view.resolution = resolution;
  }
}

/**
 * Vector shapes. Draw with the Pixi Graphics API on `draw`; the hitbox defaults to the shape's
 * bounds.
 *
 * @example
 * ```ts
 * const wall = this.spawn(Graphics, { x: 100, y: 500 });
 * wall.draw.rect(0, 0, 400, 32).fill(0x303030);
 * ```
 */
export class Graphics extends GameObject {
  static override hitbox: HitboxSpec = 'auto';
  /** Pixi graphics to draw on (`rect`, `circle`, `fill`, `stroke`…). */
  readonly draw = new PixiGraphics();

  constructor() {
    super();
    this.addChild(this.draw);
    this.markEngineKeys();
  }
}

/**
 * A video as a game object (backgrounds, animated screens). MP4 H.264 plays everywhere; WebM VP9
 * with transparency on desktop and Android.
 *
 * @example
 * ```ts
 * const intro = this.spawn(Video, { source: 'intro', loop: true });
 * intro.play();
 * ```
 */
export class Video extends GameObject {
  /** Video asset key or path; several formats of the same name are tried in order. */
  source: AssetKey | undefined;
  /** Starts over at the end. Set it before the video loads. */
  loop = false;
  /** Plays without sound; browsers only autoplay muted videos. Set it before the video loads. */
  muted = true;
  /** The Pixi sprite showing the video frames. */
  readonly view = new PixiSprite();
  /** The underlying `<video>` element once loaded, for its time, volume or events. */
  element: HTMLVideoElement | undefined;

  constructor() {
    super();
    this.view.anchor.set(0.5);
    this.addChild(this.view);
    this.markEngineKeys();
  }

  override create(): void {
    if (this.source) this.load(this.source);
  }

  override onRestore(): void {
    this.create();
  }

  override snapshotState() {
    return {
      source: this.source,
      loop: this.loop,
      muted: this.muted,
      time: this.element?.currentTime ?? 0,
    };
  }

  override restoreState(state: Record<string, unknown>): void {
    this.source = state.source as AssetKey | undefined;
    this.loop = !!state.loop;
    this.muted = !!state.muted;
    if (this.element && typeof state.time === 'number') this.element.currentTime = state.time;
  }

  /** Sets the video file; it starts paused. */
  load(source: AssetKey): void {
    const element = document.createElement('video');
    element.playsInline = true;
    element.crossOrigin = 'anonymous';
    element.preload = 'auto';
    element.loop = this.loop;
    element.muted = this.muted;
    const paths = this.game.assets.find(source, {
      baseDir: (this.constructor as typeof Video).objectPath,
      preferDirs: [`scenes/${this.scene.name}`],
      extensions: VIDEO_EXTENSIONS,
    });
    for (const path of paths) {
      const tag = document.createElement('source');
      tag.src = this.game.assets.url(path)!;
      tag.type = path.endsWith('.webm')
        ? 'video/webm'
        : path.endsWith('.mov')
          ? 'video/quicktime'
          : 'video/mp4';
      element.append(tag);
    }
    this.element = element;
    this.view.texture = Texture.from(element);
  }

  /** Starts or resumes playback; the promise rejects when the browser refuses (unmuted autoplay). */
  play(): Promise<void> {
    return this.element?.play() ?? Promise.resolve();
  }

  /** Pauses playback at the current time. */
  pause(): void {
    this.element?.pause();
  }

  /** `true` once a non-looping video reached its end. */
  get ended(): boolean {
    return this.element?.ended ?? false;
  }

  override onDestroy(): void {
    this.element?.pause();
    this.element?.removeAttribute('src');
    this.element?.load();
  }
}
