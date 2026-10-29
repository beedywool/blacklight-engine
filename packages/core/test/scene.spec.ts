import { describe, expect, it, vi } from 'vitest';
import {
  behaviors,
  Bounce,
  Flash,
  GridMovement,
  Patrol,
  type EightDirections,
  type Platformer,
} from '../src/behaviors/index';
import { GameObject } from '../src/objects/game-object';
import { TilemapLayer } from '../src/objects/tilemap';
import { testScene } from './helpers';

class Box extends GameObject {
  static override hitbox = { type: 'box' as const, x: -8, y: -8, width: 16, height: 16 };
  hp = 3;
  friend: GameObject | undefined;
}

class Wall extends GameObject {
  static override hitbox = { type: 'box' as const, width: 32, height: 32 };
  static override collision = { solid: true };
}

class Ledge extends GameObject {
  static override hitbox = { type: 'box' as const, width: 200, height: 10 };
  static override collision = { jumpThru: true };
}

describe('Scene', () => {
  it('spawns, finds and destroys objects', () => {
    const scene = testScene();
    const a = scene.spawn(Box, { x: 10, y: 20, hp: 5 });
    expect(a.x).toBe(10);
    expect(a.hp).toBe(5);
    expect(a.id).toBe(1);
    expect(scene.find(Box)).toBe(a);
    expect(scene.find('Box')).toBe(a);
    a.destroy();
    expect(scene.objects).toHaveLength(0);
    expect(a.alive).toBe(false);
  });

  it('applies velocity and stops at solids', () => {
    const scene = testScene();
    scene.spawn(Wall, { x: 100, y: 0 });
    const box = scene.spawn(Box, { x: 50, y: 16, velocity: { x: 600, y: 0 } });
    scene.tick(30);
    expect(box.x).toBe(92); // right edge (x + 8) touches the wall at 100
  });

  it('reports collision start, end and leaving the scene', () => {
    const scene = testScene();
    const events: string[] = [];
    class Probe extends Box {
      override onCollide(other: GameObject) {
        events.push(`hit ${other.objectName}`);
      }
      override onCollideEnd() {
        events.push('end');
      }
      override onLeave(side: string) {
        events.push(`leave ${side}`);
      }
    }
    scene.spawn(Box, { x: 100, y: 100 });
    const probe = scene.spawn(Probe, { x: 60, y: 100, velocity: { x: 1200, y: 0 } });
    probe.collision.blockedBySolids = false;
    scene.tick(2);
    expect(events).toEqual(['hit Box']);
    scene.tick(30);
    expect(events).toEqual(['hit Box', 'end', 'leave right']);
  });

  it('raycasts to the nearest object', () => {
    const scene = testScene();
    scene.spawn(Wall, { x: 200, y: 0 });
    const near = scene.spawn(Wall, { x: 100, y: 0 });
    scene.tick();
    const hit = scene.raycast({ x: 0, y: 16 }, { x: 400, y: 16 });
    expect(hit?.object).toBe(near);
    expect(hit?.distance).toBeCloseTo(100);
  });

  it('runs timers and tweens on game time', () => {
    const scene = testScene();
    const box = scene.spawn(Box);
    const done = vi.fn();
    box.after(100, done);
    box.tween({ alpha: 0 }, { duration: 100, ease: 'linear' });
    scene.tick(6);
    expect(done).toHaveBeenCalled();
    expect(box.alpha).toBe(0);
  });

  it('snapshots and restores objects, fields, references and randomness', () => {
    const scene = testScene();
    const a = scene.spawn(Box, { x: 1, y: 2 });
    const b = scene.spawn(Box, { x: 3, y: 4 });
    a.friend = b;
    const snapshot = scene.snapshot();
    const roll = scene.random.next();
    a.x = 50;
    a.hp = 0;
    b.destroy();
    scene.spawn(Box, { x: 9 });
    scene.restore(snapshot);
    expect(scene.objects).toHaveLength(2);
    const restored = scene.byId(b.id) as Box;
    expect(restored).not.toBe(b);
    expect(restored.x).toBe(3);
    expect(a.x).toBe(1);
    expect(a.hp).toBe(3);
    expect(a.friend).toBe(restored);
    expect(scene.random.next()).toBe(roll);
    expect(JSON.parse(JSON.stringify({ ...snapshot, memory: undefined })).objects).toHaveLength(2);
  });
});

describe('behaviors', () => {
  it('eightDirections moves with input and is blocked by walls', () => {
    const scene = testScene();
    class Hero extends Box {
      static override behaviors = [behaviors.eightDirections({ speed: 120 })];
    }
    const hero = scene.spawn(Hero, { x: 50, y: 16 });
    scene.spawn(Wall, { x: 100, y: 0 });
    scene.input.keyDown('ArrowRight');
    scene.tick(60);
    expect(hero.x).toBe(92);
    expect(hero.behavior<EightDirections>('eightDirections')!.facing).toBe('right');
  });

  it('platformer falls, lands, jumps and uses one-way platforms', () => {
    const scene = testScene();
    class Hero extends Box {
      static override behaviors = [behaviors.platformer()];
    }
    scene.spawn(Wall, { x: 0, y: 200 });
    scene.spawn(Wall, { x: 32, y: 200 });
    scene.spawn(Ledge, { x: 0, y: 120 });
    const hero = scene.spawn(Hero, { x: 30, y: 150 });
    scene.tick(60);
    const move = hero.behavior<Platformer>('platformer')!;
    expect(move.onGround).toBe(true);
    expect(hero.y).toBe(192);
    scene.input.keyDown('Space');
    scene.tick(1);
    expect(move.state).toBe('jump');
    scene.tick(25);
    scene.input.keyUp('Space');
    scene.tick(60);
    expect(move.onGround).toBe(true);
    expect(hero.y).toBe(112); // landed on the one-way ledge from below
  });

  it('bounce reflects off solids and edges', () => {
    const scene = testScene();
    class Ball extends Box {
      static override behaviors = [behaviors.bounce({ speed: 300, angle: 0 })];
    }
    const ball = scene.spawn(Ball, { x: 600, y: 100 });
    scene.tick(30);
    expect(ball.behavior(Bounce)).toBeDefined();
    expect(ball.velocity.x).toBeLessThan(0);
  });

  it('patrol turns around, flash blinks, bullets die on walls', () => {
    const scene = testScene();
    class Guard extends Box {
      static override behaviors = [behaviors.patrol({ distance: 20, speed: 60 })];
    }
    const guard = scene.spawn(Guard, { x: 100, y: 100 });
    scene.tick(30);
    expect(guard.behavior(Patrol)!.direction).toBe(-1);

    class Blinker extends Box {
      static override behaviors = [behaviors.flash({ autoStart: 200, interval: 50 })];
    }
    const blinker = scene.spawn(Blinker);
    scene.tick(2);
    expect(blinker.visible).toBe(false);
    scene.tick(20);
    expect(blinker.visible).toBe(true);
    expect(blinker.behavior(Flash)!.flashing).toBe(false);

    class Shot extends Box {
      static override behaviors = [behaviors.bullet({ speed: 900, angle: 0 })];
    }
    scene.spawn(Wall, { x: 300, y: 400 });
    const shot = scene.spawn(Shot, { x: 250, y: 416 });
    scene.tick(10);
    expect(shot.alive).toBe(false);
  });

  it('grid movement walks a path around solids', () => {
    const scene = testScene();
    class Piece extends Box {
      static override behaviors = [
        behaviors.gridMovement({ cellSize: 32, speed: 10, controlled: false }),
      ];
    }
    scene.spawn(Wall, { x: 32, y: 0 });
    const piece = scene.spawn(Piece, { x: 16, y: 16 });
    expect(piece.behavior(GridMovement)!.moveTo(2, 0)).toBe(true);
    scene.tick(120);
    expect([piece.x, piece.y]).toEqual([80, 16]);
  });

  it('destroyOutsideLayout and wrapAroundScreen', () => {
    const scene = testScene();
    class Gone extends Box {
      static override behaviors = [behaviors.destroyOutsideLayout({ margin: 0 })];
    }
    class Wrap extends Box {
      static override behaviors = [behaviors.wrapAroundScreen()];
    }
    const gone = scene.spawn(Gone, { x: 700, y: 10 });
    const wrap = scene.spawn(Wrap, { x: 660, y: 10 });
    scene.tick();
    expect(gone.alive).toBe(false);
    expect(wrap.x).toBeCloseTo(4); // fully past the right edge → back in from the left
  });
});

describe('TilemapLayer.fromTiled', () => {
  it('converts layers, solid tiles and animations', () => {
    const data = TilemapLayer.fromTiled(
      {
        width: 2,
        height: 1,
        tilewidth: 16,
        tileheight: 16,
        layers: [{ name: 'ground', type: 'tilelayer', data: [1, 0x80000002] }],
        tilesets: [
          {
            firstgid: 1,
            tiles: [
              { id: 0, properties: [{ name: 'solid', value: true }] },
              {
                id: 1,
                animation: [
                  { tileid: 1, duration: 100 },
                  { tileid: 2, duration: 100 },
                ],
              },
            ],
          },
        ],
      },
      'ground',
      'tiles',
    );
    expect(data.tiles).toEqual([1, 2]);
    expect(data.tileset.solid).toEqual([1]);
    expect(data.tileset.animated?.[2]).toEqual({ frames: [2, 3], fps: 10 });
    expect(() =>
      TilemapLayer.fromTiled(
        { width: 1, height: 1, tilewidth: 1, tileheight: 1, layers: [], tilesets: [] },
        'x',
        't',
      ),
    ).toThrow(/no tile layer/);
  });
});
