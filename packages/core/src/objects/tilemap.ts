import { Container as PixiContainer, Rectangle, Sprite as PixiSprite, Texture } from 'pixi.js';
import type { SolidProvider } from '../collision/world';
import { toWorld, type WorldShape } from '../collision/shapes';
import type { Rect } from '../math';
import { IMAGE_EXTENSIONS } from '../assets';
import type { AssetKey } from '../register';
import { GameObject } from './game-object';

/** Tile images and per-tile properties. Tile numbers start at 1; 0 is an empty cell. */
export interface Tileset {
  /** Tileset image (asset key or path). */
  image: AssetKey;
  tileWidth: number;
  tileHeight: number;
  /** Pixels around the image and between tiles. */
  margin?: number;
  spacing?: number;
  /** Solid tiles. Omitted: every tile is solid when the layer is `solid`. */
  solid?: number[];
  /** One-way tiles: solid from above only. */
  jumpThru?: number[];
  /** Non-rectangular solid tiles (slopes): polygon points in tile pixels. */
  shapes?: Record<number, [number, number][]>;
  /** Animated tiles: tile → frames (tile numbers) and frame rate. */
  animated?: Record<number, { frames: number[]; fps: number }>;
}

/** A tile layer written by hand or exported from the VS Code scene editor. */
export interface TilemapData {
  tileset: Tileset;
  /** Size in tiles. */
  columns: number;
  rows: number;
  /** Row-major tile numbers, `columns × rows` long; 0 = empty. */
  tiles: number[];
  /** Every non-empty tile blocks movement (unless `tileset.solid` lists the solid ones). */
  solid?: boolean;
}

/** The subset of a Tiled JSON map the importer reads. */
export interface TiledMap {
  width: number;
  height: number;
  tilewidth: number;
  tileheight: number;
  layers: { name: string; type: string; data?: number[]; width?: number; height?: number }[];
  tilesets: {
    firstgid: number;
    image?: string;
    margin?: number;
    spacing?: number;
    tiles?: {
      id: number;
      properties?: { name: string; value: unknown }[];
      animation?: { tileid: number; duration: number }[];
    }[];
  }[];
}

const CHUNK = 16;
const TILED_FLAGS = 0x1fffffff;

/**
 * A grid of tiles from one tileset. Tiles are drawn in cached chunks; solid tiles block objects
 * that move with `move()` and behaviors, and stop raycasts.
 *
 * @example
 * ```ts
 * import level from './level-1.tilemap.json';
 * const ground = this.spawn(TilemapLayer, { map: level });
 * ground.setTile(4, 10, 0); // dig a hole
 * ```
 */
export class TilemapLayer extends GameObject implements SolidProvider {
  /** Map to show; set with spawn props or `load()`. */
  map: TilemapData | undefined;
  private data: TilemapData | undefined;
  private textures: Texture[] = [];
  private chunks = new Map<number, PixiContainer>();
  private readonly animatedLayer = new PixiContainer();
  private animatedSprites: { sprite: PixiSprite; tile: number }[] = [];
  private animationTime = 0;

  constructor() {
    super();
    this.markEngineKeys();
  }

  override create(): void {
    this.scene.collisions.providers.add(this);
    if (this.map) this.load(this.map);
  }

  override onRestore(): void {
    this.create();
  }

  override snapshotState() {
    return { map: this.data ? JSON.parse(JSON.stringify(this.data)) : undefined };
  }

  override restoreState(state: Record<string, unknown>): void {
    const map = state.map as TilemapData | undefined;
    if (!map) return;
    this.map = map;
    // A layer already on screen redraws now; a re-created one loads in onRestore.
    if (this.textures.length > 0 && JSON.stringify(map.tiles) !== JSON.stringify(this.data?.tiles))
      this.load(map);
  }

  override onDestroy(): void {
    this.scene?.collisions.providers.delete(this);
  }

  /** Width and height of a tile in pixels. */
  get tileWidth(): number {
    return this.data?.tileset.tileWidth ?? 0;
  }
  get tileHeight(): number {
    return this.data?.tileset.tileHeight ?? 0;
  }
  get columns(): number {
    return this.data?.columns ?? 0;
  }
  get rows(): number {
    return this.data?.rows ?? 0;
  }

  /** Shows a map (the tileset image must be loaded). */
  load(map: TilemapData): void {
    if (map.tiles.length !== map.columns * map.rows) {
      throw new Error(
        `Tilemap has ${map.tiles.length} tiles; columns × rows is ${map.columns * map.rows}.`,
      );
    }
    this.data = { ...map, tiles: [...map.tiles] };
    const path = this.game.assets.find(map.tileset.image, {
      baseDir: (this.constructor as typeof TilemapLayer).objectPath,
      preferDirs: [`scenes/${this.scene.name}`],
      extensions: IMAGE_EXTENSIONS,
    })[0]!;
    const image = this.game.assets.texture(path);
    const { tileWidth: tw, tileHeight: th, margin = 0, spacing = 0 } = map.tileset;
    this.textures = [];
    for (const { sprite } of this.animatedSprites) sprite.destroy();
    this.animatedSprites = [];
    for (let y = margin; y + th <= image.frame.height; y += th + spacing) {
      for (let x = margin; x + tw <= image.frame.width; x += tw + spacing) {
        this.textures.push(
          new Texture({
            source: image.source,
            frame: new Rectangle(image.frame.x + x, image.frame.y + y, tw, th),
          }),
        );
      }
    }
    for (const chunk of this.chunks.values()) chunk.destroy({ children: true });
    this.chunks.clear();
    this.removeChildren();
    for (let cy = 0; cy < Math.ceil(map.rows / CHUNK); cy++) {
      for (let cx = 0; cx < Math.ceil(map.columns / CHUNK); cx++) this.buildChunk(cx, cy);
    }
    this.addChild(this.animatedLayer);
  }

  /** Tile number at a cell (0 when empty or outside). */
  getTile(column: number, row: number): number {
    if (!this.data || column < 0 || row < 0 || column >= this.data.columns || row >= this.data.rows)
      return 0;
    return this.data.tiles[row * this.data.columns + column]!;
  }

  /** Changes a cell and redraws its chunk. */
  setTile(column: number, row: number, tile: number): void {
    if (!this.data || column < 0 || row < 0 || column >= this.data.columns || row >= this.data.rows)
      return;
    this.data.tiles[row * this.data.columns + column] = tile;
    this.buildChunk(Math.floor(column / CHUNK), Math.floor(row / CHUNK));
  }

  /** Cell under a point in scene coordinates. */
  cellAt(x: number, y: number): { column: number; row: number } {
    const t = this.sceneTransform();
    return {
      column: Math.floor((x - t.x) / (this.tileWidth * t.scaleX)),
      row: Math.floor((y - t.y) / (this.tileHeight * t.scaleY)),
    };
  }

  private buildChunk(cx: number, cy: number): void {
    const data = this.data!;
    const key = cy * 4096 + cx;
    this.chunks.get(key)?.destroy({ children: true });
    this.animatedSprites = this.animatedSprites.filter(({ sprite }) => {
      const inChunk =
        Math.floor(sprite.x / data.tileset.tileWidth / CHUNK) === cx &&
        Math.floor(sprite.y / data.tileset.tileHeight / CHUNK) === cy;
      if (inChunk) sprite.destroy();
      return !inChunk;
    });
    const chunk = new PixiContainer();
    for (let row = cy * CHUNK; row < Math.min(data.rows, (cy + 1) * CHUNK); row++) {
      for (let column = cx * CHUNK; column < Math.min(data.columns, (cx + 1) * CHUNK); column++) {
        const tile = data.tiles[row * data.columns + column]!;
        if (tile <= 0) continue;
        const sprite = new PixiSprite(this.textures[tile - 1] ?? Texture.EMPTY);
        sprite.position.set(column * data.tileset.tileWidth, row * data.tileset.tileHeight);
        if (data.tileset.animated?.[tile]) {
          this.animatedLayer.addChild(sprite);
          this.animatedSprites.push({ sprite, tile });
        } else {
          chunk.addChild(sprite);
        }
      }
    }
    this.chunks.set(key, chunk);
    this.addChildAt(chunk, 0);
    if (chunk.children.length > 0) chunk.cacheAsTexture(true);
  }

  protected override stepInternal(dt: number): void {
    const animated = this.data?.tileset.animated;
    if (!animated || this.animatedSprites.length === 0) return;
    this.animationTime += dt;
    for (const { sprite, tile } of this.animatedSprites) {
      const { frames, fps } = animated[tile]!;
      const frame = frames[Math.floor(this.animationTime * fps) % frames.length]!;
      sprite.texture = this.textures[frame - 1] ?? Texture.EMPTY;
    }
  }

  /** Solid tiles overlapping `bounds`, in scene coordinates. */
  solidShapes(bounds: Rect): { shape: WorldShape; jumpThru: boolean }[] {
    const data = this.data;
    if (!data || !this.alive) return [];
    const { tileset } = data;
    const solid = tileset.solid ? new Set(tileset.solid) : undefined;
    const jumpThru = new Set(tileset.jumpThru ?? []);
    if (!solid && !data.solid && jumpThru.size === 0) return [];
    const t = this.sceneTransform();
    const tw = tileset.tileWidth * t.scaleX;
    const th = tileset.tileHeight * t.scaleY;
    const c0 = Math.max(0, Math.floor((bounds.x - t.x) / tw));
    const c1 = Math.min(data.columns - 1, Math.floor((bounds.x + bounds.width - t.x) / tw));
    const r0 = Math.max(0, Math.floor((bounds.y - t.y) / th));
    const r1 = Math.min(data.rows - 1, Math.floor((bounds.y + bounds.height - t.y) / th));
    const out: { shape: WorldShape; jumpThru: boolean }[] = [];
    for (let row = r0; row <= r1; row++) {
      for (let column = c0; column <= c1; column++) {
        const tile = data.tiles[row * data.columns + column]!;
        if (tile <= 0) continue;
        const isJumpThru = jumpThru.has(tile);
        if (!isJumpThru && !(solid ? solid.has(tile) : data.solid)) continue;
        const x = t.x + column * tw;
        const y = t.y + row * th;
        const polygon = tileset.shapes?.[tile];
        const shape: WorldShape = polygon
          ? toWorld(
              { type: 'polygon', points: polygon },
              { x, y, rotation: 0, scaleX: t.scaleX, scaleY: t.scaleY },
            )
          : { kind: 'box', rect: { x, y, width: tw, height: th } };
        out.push({ shape, jumpThru: isJumpThru });
      }
    }
    return out;
  }

  /**
   * Converts a tile layer of a Tiled JSON map. Tiles with a boolean `solid` or `jumpThru`
   * property, and Tiled tile animations, carry over.
   *
   * @param image - Tileset image as an asset key or path (Tiled's own path is ignored).
   */
  static fromTiled(map: TiledMap, layerName: string, image: AssetKey): TilemapData {
    const layer = map.layers.find((l) => l.name === layerName && l.type === 'tilelayer');
    if (!layer?.data) {
      const names = map.layers.filter((l) => l.type === 'tilelayer').map((l) => `"${l.name}"`);
      throw new Error(
        `The Tiled map has no tile layer "${layerName}". Tile layers: ${names.join(', ') || 'none'}.`,
      );
    }
    const tileset = map.tilesets[0];
    if (!tileset) throw new Error('The Tiled map has no tileset.');
    const offset = tileset.firstgid - 1;
    const solid: number[] = [];
    const jumpThru: number[] = [];
    const animated: Tileset['animated'] = {};
    for (const tile of tileset.tiles ?? []) {
      const number = tile.id + 1;
      for (const property of tile.properties ?? []) {
        if (property.name === 'solid' && property.value === true) solid.push(number);
        if (property.name === 'jumpThru' && property.value === true) jumpThru.push(number);
      }
      if (tile.animation?.length) {
        const duration =
          tile.animation.reduce((sum, f) => sum + f.duration, 0) / tile.animation.length;
        animated[number] = {
          frames: tile.animation.map((f) => f.tileid + 1),
          fps: 1000 / duration,
        };
      }
    }
    return {
      columns: layer.width ?? map.width,
      rows: layer.height ?? map.height,
      tiles: layer.data.map((gid) => {
        const id = gid & TILED_FLAGS;
        return id === 0 ? 0 : id - offset;
      }),
      tileset: {
        image,
        tileWidth: map.tilewidth,
        tileHeight: map.tileheight,
        margin: tileset.margin,
        spacing: tileset.spacing,
        solid: solid.length > 0 ? solid : undefined,
        jumpThru,
        animated,
      },
    };
  }
}
