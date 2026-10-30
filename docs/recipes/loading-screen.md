# Custom loading screen

While `goto` loads the next scene's code, its `static assets`, the files of its `assets/` folder and the sprite sheets of its objects, the game draws `game.loadingScreen`. The default is a thin white bar. Replace it with any object that has a `draw(layer, progress, size)` method: `layer` is an empty Pixi container covering the design area, `progress` goes from 0 to 1, and the layer is destroyed when the scene starts.

```ts
// scenes/title/title.scene.ts
import { Scene, type LoadingScreen } from '@blacklight/core';
import { Graphics as PixiGraphics, Text as PixiText } from 'pixi.js';

const stripes: LoadingScreen = {
  draw(layer, progress, { width, height }) {
    // Called many times: create the drawing once, then update it.
    let bar = layer.children[0] as PixiGraphics | undefined;
    let label = layer.children[1] as PixiText | undefined;
    if (!bar || !label) {
      bar = layer.addChild(new PixiGraphics());
      label = layer.addChild(
        new PixiText({ text: '', style: { fill: 0xffffff, fontSize: 48, fontWeight: '700' } }),
      );
      label.anchor.set(1, 1);
      label.position.set(width - 80, height - 120);
    }
    bar
      .clear()
      .rect(0, 0, width, height)
      .fill(0x080808)
      .poly([
        0,
        height - 80,
        width * progress,
        height - 80,
        width * progress - 40,
        height - 40,
        0,
        height - 40,
      ])
      .fill(0xe60012);
    label.text = `${Math.round(progress * 100)}%`;
  },
};

export default class Title extends Scene {
  override create() {
    this.game.loadingScreen = stripes;
    // Load the next scene while the player reads the menu.
    void this.game.preload('field');
  }
}
```

The layer holds plain Pixi objects, drawn outside any scene. Importing from `pixi.js` needs it in your game's dependencies, at the version the engine uses (`pnpm add pixi.js@8.22.0`).

`game.preload(name)` loads a scene ahead of time, so the following `goto` starts it at once without showing the loading screen. The `loading` event on `game.events` reports `{ scene, progress }` for a loading screen drawn in the UI layer instead, with a Vue screen opened before `goto` and closed after it.

## Limits

- The first scene loads before any of your code runs, so it shows the default bar. Keep the entry scene light (a title or a splash) and set `loadingScreen` there.
- Progress counts files and sheets, not bytes: one large file moves the bar as much as one small one.
