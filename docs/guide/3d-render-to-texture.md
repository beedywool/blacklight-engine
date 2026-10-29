# Render to texture

A model can be drawn into a texture instead of directly into the frame. The texture is then an image like any other: in the scene it is shown by a sprite, so Pixi filters, masks, `alpha` and `tint` apply; in a Vue screen it is shown by a canvas, so CSS applies. The model still renders through the game's shared WebGL context, with the same files, animations and lights as a [`Model3D`](./3d).

## In a scene

```ts
import { Graphics } from '@blacklight/core';
import { Model3D } from '@blacklight/three';
import { ColorMatrixFilter } from 'pixi.js';

export default class Portrait extends Model3D {
  static override model = '@models/hero.glb';
  static override pixelsPerUnit = 220;
  static override renderToTexture = { width: 200, height: 200, center: { x: 0, y: 1.5 } };
  static override view = { camera: 'perspective' as const, fov: 30 };

  override create() {
    const sepia = new ColorMatrixFilter();
    sepia.sepia(false);
    this.filters = [sepia];
    const mask = this.scene.spawn(Graphics, { x: this.x, y: this.y, layer: 'hud' });
    mask.draw.circle(0, 0, 74).fill(0xffffff);
    this.mask = mask;
    // The origin is at the feet: move down so the head (1.5 units up) is in the circle.
    this.teleport(this.x, this.y + 1.5 * Portrait.pixelsPerUnit);
  }
}
```

The object keeps every `Model3D` behavior (position, layer, `play`, `rotation3d`, snapshots); only the drawing changes. The texture is redrawn once per displayed frame, also while the game is paused, and only while the object is visible.

| `static renderToTexture` field | Default                            | Meaning                                                             |
| ------------------------------ | ---------------------------------- | ------------------------------------------------------------------- |
| `width`, `height`              | the bounding sphere, with a margin | Texture size in virtual pixels.                                     |
| `resolution`                   | `game.textResolution`              | Texture pixels per virtual pixel (screen pixels per virtual pixel). |
| `center`                       | the bounding sphere's center       | Point of the model, in model units, at the middle of the texture.   |

`true` takes every default. The texture's center is also the perspective camera's center, so a perspective model in a texture is seen from the front, wherever the object is on screen. With `static view` the object uses its own camera and lights; otherwise those of its layer.

## In a Vue screen

`ModelView` from `@blacklight/three/ui` shows a model in a `@blacklight/ui` screen. Sizes are UI virtual pixels, like the rest of the screen.

```vue
<script setup lang="ts">
import { ModelView } from '@blacklight/three/ui';
</script>

<template>
  <div class="character">
    <ModelView model="hero" animation="idle" :width="360" :height="480" :spin="45" />
  </div>
</template>
```

| Prop              | Default                        | Meaning                                                            |
| ----------------- | ------------------------------ | ------------------------------------------------------------------ |
| `model`           | required                       | Asset key (`hero`) or path (`@models/hero.glb`); loaded if needed. |
| `animation`       | first clip                     | Clip to play; changing the prop plays the new one.                 |
| `width`, `height` | `256`                          | Size in UI virtual pixels.                                         |
| `spin`            | `0`                            | Turning speed around the vertical axis, degrees per second.        |
| `yaw`             | `0`                            | Starting turn, in degrees.                                         |
| `view`            | perspective, fov 30            | Camera and lights ([options](./3d#layers-cameras-and-lights)).     |
| `pixelsPerUnit`   | model fills 90 % of the height | Scale of the model.                                                |
| `animations`      | none                           | Per-clip settings, as `static animations`.                         |

It emits `ready` with its `ModelPreview` once the model is shown; the preview's `play()` and `object3d` control it from code. The model animates in real time: a pause menu that stops the game still shows it moving. The element is a `<canvas class="bl-model-view">`; CSS filters, `clip-path`, masks and transforms apply to it like to any element.

Without Vue, `ModelPreview` does the same for any page element:

```ts
import { ModelPreview } from '@blacklight/three';

const preview = new ModelPreview(game, { model: 'hero', width: 320, height: 420, spin: 30 });
document.querySelector('#shop')!.append(preview.canvas);
await preview.ready;
preview.play('wave');
// when the element goes away
preview.destroy();
```

## How it works

In a scene, the object holds a Pixi `RenderTexture` with a depth buffer; each frame, before Pixi draws the screen, the model is drawn into it through the [shared context](./3d#shared-webgl-context), and a Pixi sprite shows it. For a Vue screen there is no Pixi sprite to show it: after the model is drawn into the texture, its pixels are read back (`readPixels`) and copied into the canvas, once per frame.

## Limits

- The Vue view copies pixels from the GPU every frame, and the main thread waits for the GPU to finish drawing the view before it can read them. The cost grows with the size of the view: keep one or two views on screen, small, and destroy them when hidden (unmounting does it).
- A texture has a fixed size: parts of the model outside it are cut. Animations that reach far (a sword swing) need a larger `width` / `height` than the rest bounds.
- Each render-to-texture model has its own texture: memory is `width × height × resolution² × 4` bytes, plus a depth buffer.
- Pixel-art mode does not apply to the texture's content.
