import { InputManager } from '../src/input/input';
import { Random } from '../src/random';
import { Scene } from '../src/scene';
import type { Game } from '../src/game';
import type { GameObject } from '../src/objects/game-object';

/** A scene running against a minimal game: no renderer, no DOM. */
export function testScene<S extends Scene<never>>(
  SceneClass: new () => S = class extends Scene {} as never,
): S & { tick(n?: number): void } {
  const classes = new Map<string, typeof GameObject>();
  const input = new InputManager({}, undefined, () => []);
  const game = {
    config: {
      resolution: { width: 640, height: 360, mode: 'extend', pixelArt: false },
      tickRate: 60,
    },
    random: new Random('test'),
    input,
    audio: {
      updateListener: () => {},
      play: () => undefined,
      music: () => undefined,
      stopMusic: () => {},
    },
    sheets: { get: () => undefined },
    textResolution: 1,
    time: { dt: 1 / 60 },
    rememberClass: (type: typeof GameObject) => classes.set(type.objectName ?? type.name, type),
    objectClass: (name: string) => classes.get(name),
  } as unknown as Game;
  const scene = new SceneClass();
  scene.init(game, 'test');
  return Object.assign(scene, {
    tick(n = 1) {
      for (let i = 0; i < n; i++) {
        input.update();
        scene.step(1 / 60);
      }
    },
  });
}
