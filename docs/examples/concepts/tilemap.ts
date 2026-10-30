// A tilemap defined in code: grey and red tiles are solid, the lights are animated. Arrows move.
// Click a cell to dig or fill it.
import { Graphics, Scene, TilemapLayer, behaviors, type TilemapData } from '@blacklight/core';

const ROWS = [
  '22222222222222222222',
  '2..................2',
  '2..3.......3.......2',
  '2..................2',
  '2......1111....11..2',
  '2..................2',
  '2..11.........3....2',
  '2..............1...2',
  '2....3....111......2',
  '2..................2',
  '11111111111111111111',
];

const level: TilemapData = {
  tileset: {
    image: '@assets/tiles.png',
    tileWidth: 16,
    tileHeight: 16,
    solid: [1, 2],
    animated: { 3: { frames: [3, 4], fps: 2 } },
  },
  columns: 20,
  rows: ROWS.length,
  tiles: ROWS.join('')
    .split('')
    .map((c) => (c === '.' ? 0 : Number(c))),
};

class Ball extends Graphics {
  static override hitbox = { type: 'circle' as const, radius: 5 };
  static override behaviors = [behaviors.eightDirections({ speed: 90 })];

  override create() {
    this.draw.circle(0, 0, 5).fill(0xffffff);
  }
}

export default class Example extends Scene {
  // The tileset image loads with the scene.
  static override assets = ['@assets/tiles.png'];
  private ground!: TilemapLayer;

  override create() {
    this.spawn(Graphics).draw.rect(0, 0, this.width, this.height).fill(0x080808);
    this.ground = this.spawn(TilemapLayer, { map: level });
    this.spawn(Ball, { x: 40, y: 40 });
  }

  override update() {
    if (!this.pointer.pressed) return;
    const { column, row } = this.ground.cellAt(this.pointer.x, this.pointer.y);
    if (column < 0 || row < 0 || column >= this.ground.columns || row >= this.ground.rows) return;
    this.ground.setTile(column, row, this.ground.getTile(column, row) === 0 ? 2 : 0);
  }
}

// A small pixel-art resolution: 320x180, scaled up with nearest filtering.
export const config = {
  resolution: { width: 320, height: 180, mode: 'letterbox' as const, pixelArt: true },
};
