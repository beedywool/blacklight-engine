import { Graphics, Scene, TilemapLayer, type ObjectName, type TiledMap } from '@blacklight/core';
import type Hero from '@objects/hero/hero.object';
import { progress, resetProgress } from '@ui/progress';

/** A Tiled map with the object layer this level reads (points with a type and properties). */
interface LevelMap extends TiledMap {
  layers: (TiledMap['layers'][number] & {
    objects?: {
      type: ObjectName | 'Start';
      x: number;
      y: number;
      properties?: { name: string; value: unknown }[];
    }[];
  })[];
  tilesets: (TiledMap['tilesets'][number] & {
    tiles?: { id: number; properties?: { name: string; value: unknown }[] }[];
  })[];
}

const TILE = 16;

/**
 * One level, drawn in Tiled (`assets/level-1.json`, open it in Tiled to edit): the `ground` tile
 * layer becomes a `TilemapLayer` (solid and one-way tiles come from tile properties) and every
 * point of the `objects` layer spawns the object named by its type.
 */
export default class Level extends Scene {
  static override layers = ['back', 'main'];

  hero!: Hero;
  ground!: TilemapLayer;
  private hazards = new Set<number>();
  private hills!: Graphics;
  private clearShown = false;

  override create() {
    const map = this.game.assets.getJson<LevelMap>('scenes/level/assets/level-1.json');
    const width = map.width * TILE;
    const height = map.height * TILE;
    this.drawBackground(width, height);

    this.ground = this.spawn(TilemapLayer, { map: TilemapLayer.fromTiled(map, 'ground', 'tiles') });
    for (const tile of map.tilesets[0]?.tiles ?? []) {
      if (tile.properties?.some((p) => p.name === 'hazard' && p.value === true))
        this.hazards.add(tile.id + 1);
    }

    let coins = 0;
    for (const object of map.layers.find((l) => l.name === 'objects')?.objects ?? []) {
      const props = Object.fromEntries((object.properties ?? []).map((p) => [p.name, p.value]));
      if (object.type === 'Start') {
        this.hero = this.spawn('Hero', { x: object.x, y: object.y }) as unknown as Hero;
        continue;
      }
      this.spawn(object.type, { ...props, x: object.x, y: object.y });
      if (object.type === 'Coin') coins++;
    }
    resetProgress(coins);

    this.camera.zoom = 3;
    this.camera.bounds = { x: 0, y: 0, width, height };
    this.camera.follow(this.hero, { lerp: 0.15, deadzone: { width: 24, height: 40 } });
    this.camera.centerOn(this.hero.x, this.hero.y);
    this.spawn('TouchControls', { layer: 'hud' });
    this.ui.open('Hud');
  }

  override update() {
    // Water and other hazard tiles send the hero back to the last checkpoint.
    const cell = this.ground.cellAt(this.hero.x, this.hero.y - 4);
    if (this.hazards.has(this.ground.getTile(cell.column, cell.row))) this.hero.hurt();

    this.hills.x = this.camera.view.x * 0.5;
    if (progress.cleared && !this.clearShown) {
      this.clearShown = true;
      this.ui.push('Clear');
    } else if (this.input.pressed('pause')) {
      this.ui.push('PauseMenu');
    }
  }

  private drawBackground(width: number, height: number) {
    const sky = this.spawn(Graphics, { layer: 'back' });
    const bands = [0x1b2a4a, 0x24375c, 0x2e466e, 0x3a5680, 0x486892];
    bands.forEach((color, i) => {
      sky.draw
        .rect(-200, (i * height) / bands.length, width + 400, height / bands.length + 1)
        .fill(color);
    });
    this.hills = this.spawn(Graphics, { layer: 'back' });
    for (let x = -100; x < width; x += 90) {
      const h = 50 + ((x * 37) % 40);
      this.hills.draw.ellipse(x, height - 40, 70, h).fill(0x22324f);
    }
  }
}
