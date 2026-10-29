// The core test helper, typed against the package's own `@blacklight/core` import (vitest
// aliases it to the core sources, so classes match at run time too).
import {
  InputManager,
  Random,
  Scene,
  type AssetStore,
  type Game,
  type GameObject,
} from '@blacklight/core';

/** A scene running against a minimal game: no renderer, no DOM. */
export function testScene<S extends Scene<never>>(
  assets: AssetStore,
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
    assets,
    audio: { updateListener: () => {} },
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
