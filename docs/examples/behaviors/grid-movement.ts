// Arrows move one cell at a time. Click a free cell: the walker finds a path around the walls (A*).
import { Graphics, Scene, behaviors, type GridMovement } from '@blacklight/core';

const CELL = 80;
const MAP = [
  '................',
  '..####....##....',
  '.....#.....#....',
  '.....#..####....',
  '.###.#..........',
  '.....#####..##..',
  '..........#.....',
  '..........#.....',
  '................',
];

class Walker extends Graphics {
  static override behaviors = [behaviors.gridMovement({ cellSize: CELL, speed: 8 })];

  override create() {
    this.draw.circle(0, 0, 26).fill(0xffffff);
  }
}

export default class Example extends Scene {
  walker!: Walker;
  marker!: Graphics;

  override create() {
    MAP.forEach((line, row) =>
      [...line].forEach((cell, column) => {
        if (cell !== '#') return;
        const wall = this.spawn(Graphics, { x: column * CELL, y: row * CELL });
        wall.draw.rect(2, 2, CELL - 4, CELL - 4).fill(0x3a3a3a);
        wall.collision.solid = true;
      }),
    );
    this.marker = this.spawn(Graphics);
    this.marker.draw
      .rect(-CELL / 2 + 6, -CELL / 2 + 6, CELL - 12, CELL - 12)
      .stroke({ color: 0xe60012, width: 4 });
    this.marker.visible = false;
    this.walker = this.spawn(Walker, { x: CELL / 2, y: CELL / 2 });
  }

  override update() {
    if (!this.pointer.pressed) return;
    const column = Math.floor(this.pointer.x / CELL);
    const row = Math.floor(this.pointer.y / CELL);
    const grid = this.walker.behavior<GridMovement>('gridMovement')!;
    // moveTo returns false when the cell cannot be reached.
    this.marker.visible = grid.moveTo(column, row);
    this.marker.position.set((column + 0.5) * CELL, (row + 0.5) * CELL);
  }
}
