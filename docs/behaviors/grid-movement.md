# gridMovement

Moves cell by cell, for puzzle games, tactics and roguelikes. The object stays on cell centers.

```ts
static override behaviors = [behaviors.gridMovement({ cellSize: 32, speed: 8 })];

// later: walk to a cell along the shortest path
this.behavior<GridMovement>('gridMovement')!.moveTo(12, 4);
```

| Option       | Default                       | Meaning                                                     |
| ------------ | ----------------------------- | ----------------------------------------------------------- |
| `cellSize`   | required                      | Cell size in px.                                            |
| `speed`      | `6`                           | Cells per second.                                           |
| `diagonal`   | `false`                       | Allow diagonal steps in `moveTo` paths.                     |
| `actions`    | `left`, `right`, `up`, `down` | Actions read while idle.                                    |
| `controlled` | `true`                        | Read input; set `false` for objects moved only by `moveTo`. |

`cell` is the cell the object is in or heading to, `moving` is `true` while a step or a path is in progress, `path` lists the cells still to walk, and `isBlocked(column, row)` tests a cell against solids. `moveTo(column, row)` finds a path with A* and returns `false` when the cell cannot be reached. The `findPath(start, goal, blocked, { diagonal, maxNodes })` function behind it is exported for other uses; it explores at most 5000 cells by default.

`gridMovement` sets `x` / `y` directly: it does not slide along walls, it refuses to enter a blocked cell.

## Example

<LiveExample src="behaviors/grid-movement" hint="Arrows step one cell; click a cell to walk there along the shortest path." />

## Limits

- It sets `x` / `y` directly: it refuses to enter a blocked cell instead of sliding along walls.
