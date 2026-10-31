import { Rectangle, Texture, type TextureSource } from 'pixi.js';
import {
  assetKey,
  IMAGE_EXTENSIONS,
  extension,
  resolveProjectPath,
  type AssetStore,
} from '../assets';
import { maskFromRgba, type PixelMask } from '../collision/shapes';
import type { GameObject } from '../objects/game-object';
import {
  resolveAnimations,
  type AnimationFile,
  type AnimationFileInput,
  type ResolvedAnimation,
} from './animator';
import { gridSheet, isAsepriteJson, parseAseprite, parseGridName, type Sheet } from './sheets';

/** A sprite's frames ready to display. */
export interface LoadedSheet {
  /** Frames, tags and slices of the source. */
  sheet: Sheet;
  /** One texture per sheet frame, in sheet order. */
  // The source's options are spelled out: Pixi's default for them is `any`.
  textures: Texture<TextureSource<Record<string, unknown>>>[];
  /** Playable animations by name. */
  animations: Map<string, ResolvedAnimation>;
  /** Animation played on spawn (the file's `default`, else its first animation). */
  defaultAnimation: string | undefined;
  /** Pixel masks, computed on first use. */
  mask(frame: number): PixelMask | undefined;
}

/** What a sprite class draws: its animation file and/or image, from its static fields. */
export interface SpriteSource {
  animations?: AnimationFileInput;
  texture?: string;
}

/** Where a sprite class's frames come from, as project paths. */
interface SourcePlan {
  file: AnimationFile;
  /** Aseprite JSON path, or undefined for an image source. */
  json?: string;
  /** Image path, known once the JSON is loaded for Aseprite sources. */
  image?: string;
}

function baseDirOf(type: typeof GameObject): string {
  return type.objectPath ?? '';
}

/**
 * Builds and caches the sheets of sprite classes. Preloading a class loads its files; creating a
 * sprite then reads the prepared sheet synchronously. The game owns one as `game.sheets` and
 * preloads the sprites of each scene; read it to show a sprite's frames elsewhere (a menu icon).
 *
 * @example
 * ```ts
 * import { Sprite as PixiSprite } from 'pixi.js';
 *
 * // Inside a scene that uses Player: its first frame as a HUD icon.
 * const sheet = this.game.sheets.get(Player);
 * if (sheet) this.hud.addChild(new PixiSprite(sheet.textures[0]));
 * ```
 */
export class SheetCache {
  private readonly sheets = new Map<string, LoadedSheet>();
  private readonly plans = new Map<typeof GameObject, SourcePlan | null>();

  constructor(private readonly assets: AssetStore) {}

  /** Works out the files of a class; `null` when it draws nothing. */
  private plan(type: typeof GameObject & SpriteSource): SourcePlan | null {
    if (this.plans.has(type)) return this.plans.get(type)!;
    const base = baseDirOf(type);
    const name = base.slice(base.lastIndexOf('/') + 1);
    let plan: SourcePlan | null = null;
    const file = (type.animations ?? { animations: {} }) as AnimationFile;
    const source = file.source ?? type.texture;
    if (source) {
      const path = this.assets.find(source, {
        baseDir: base,
        extensions: [...IMAGE_EXTENSIONS, 'json'],
      })[0]!;
      plan = extension(path) === 'json' ? { file, json: path } : { file, image: path };
    } else if (base) {
      const candidates = [`${base}/${name}.aseprite.json`, `${base}/${name}.json`];
      const json = candidates.find((c) => this.assets.has(c));
      if (json) plan = { file, json };
      else {
        const image = this.assets.paths.find(
          (p) =>
            p.startsWith(`${base}/`) &&
            // `player.png`, or a grid sheet named with its frame size: `player@32x32.png`.
            (assetKey(p) === name || assetKey(p).startsWith(`${name}@`)) &&
            IMAGE_EXTENSIONS.includes(extension(p)),
        );
        if (image) plan = { file, image };
      }
    }
    this.plans.set(type, plan);
    return plan;
  }

  /** Loads the files of a sprite class. */
  async preload(type: typeof GameObject & SpriteSource): Promise<void> {
    const plan = this.plan(type);
    const extra = [...(type.assets ?? []), ...(type.requiredAssets?.() ?? [])].flatMap((a) =>
      this.assets.find(a, { baseDir: baseDirOf(type) }),
    );
    if (!plan) {
      await this.assets.load(extra);
      return;
    }
    if (plan.json) {
      await this.assets.load([plan.json]);
      const data = this.assets.getJson(plan.json);
      if (!isAsepriteJson(data))
        throw new Error(
          `${plan.json} is not an Aseprite JSON export (it needs "frames" and "meta").`,
        );
      const dir = plan.json.slice(0, plan.json.lastIndexOf('/'));
      plan.image = resolveProjectPath(data.meta.image ?? `${assetKey(plan.json)}.png`, dir);
    }
    await this.assets.load([plan.image!, ...extra]);
  }

  /** Prepared sheet of a preloaded sprite class, or `undefined` when it draws nothing. */
  get(type: typeof GameObject & SpriteSource): LoadedSheet | undefined {
    const plan = this.plan(type);
    if (!plan) return undefined;
    const key = `${plan.json ?? plan.image}#${this.fileKey(plan.file)}`;
    let loaded = this.sheets.get(key);
    if (!loaded) {
      if (plan.json && !plan.image) {
        throw new Error(
          `${type.objectName ?? type.name}'s sprite sheet is not loaded. Put the object in objects/ or scenes/<scene>/objects/ so it is preloaded.`,
        );
      }
      loaded = this.build(plan);
      this.sheets.set(key, loaded);
    }
    return loaded;
  }

  /** Two classes share a sheet only with the same source and the same animation file. */
  private fileKey(file: AnimationFile): string {
    return JSON.stringify(file);
  }

  private build(plan: SourcePlan): LoadedSheet {
    const image = this.assets.texture(plan.image!);
    let sheet: Sheet;
    if (plan.json) {
      sheet = parseAseprite(this.assets.getJson(plan.json) as Parameters<typeof parseAseprite>[0]);
    } else {
      const grid = parseGridName(plan.image!);
      sheet = grid
        ? gridSheet(grid, image.frame.width, image.frame.height)
        : {
            frames: [
              { rect: { x: 0, y: 0, width: image.frame.width, height: image.frame.height } },
            ],
            tags: [],
            slices: [],
          };
    }
    const textures = sheet.frames.map(
      (f) =>
        new Texture({
          source: image.source,
          frame: new Rectangle(
            image.frame.x + f.rect.x,
            image.frame.y + f.rect.y,
            f.rect.width,
            f.rect.height,
          ),
          // Trimmed Aseprite frames keep their place inside the untrimmed frame.
          ...(f.sourceSize && f.offset
            ? {
                orig: new Rectangle(0, 0, f.sourceSize.width, f.sourceSize.height),
                trim: new Rectangle(f.offset.x, f.offset.y, f.rect.width, f.rect.height),
              }
            : {}),
        }),
    );
    const file = plan.file;
    const animations =
      Object.keys(file.animations).length > 0
        ? resolveAnimations(file, sheet)
        : resolveAnimations(
            {
              ...file,
              animations:
                sheet.tags.length > 0
                  ? Object.fromEntries(sheet.tags.map((t) => [t.name, {}]))
                  : { default: { frames: { from: 0, to: sheet.frames.length - 1 } } },
            },
            sheet,
          );
    const masks = new Map<number, PixelMask | undefined>();
    return {
      sheet,
      textures,
      animations,
      defaultAnimation:
        file.default && animations.has(file.default)
          ? file.default
          : animations.keys().next().value,
      mask: (frame) => {
        if (!masks.has(frame)) masks.set(frame, readMask(textures[frame]));
        return masks.get(frame);
      },
    };
  }
}

function readMask(texture: Texture | undefined): PixelMask | undefined {
  const resource = texture?.source.resource as CanvasImageSource | undefined;
  if (!texture || !resource || typeof document === 'undefined') return undefined;
  const { x, y, width, height } = texture.frame;
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext('2d', { willReadFrequently: true });
  if (!context) return undefined;
  context.drawImage(resource, x, y, width, height, 0, 0, width, height);
  return maskFromRgba(context.getImageData(0, 0, width, height).data, width, height);
}
