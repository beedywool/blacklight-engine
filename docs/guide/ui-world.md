# World-anchored UI

DOM elements can follow game objects: name tags, health bars, interaction hints, and floating damage numbers. Positions are read after the game draws each frame, through cameras, layers, zoom and hosted scenes, so anchored elements never lag behind the object.

```vue
<script setup lang="ts">
import type { GameObject } from '@blacklight/core';
import { Gauge, WorldAnchor } from '@blacklight/ui';

defineProps<{ enemies: { object: GameObject; hp: number; max: number }[] }>();
</script>

<template>
  <WorldAnchor
    v-for="e in enemies"
    :key="e.object.id"
    :target="e.object"
    :offset="{ x: 0, y: -90 }"
  >
    <Gauge :value="e.hp" :max="e.max" style="width: 120px" />
  </WorldAnchor>
</template>
```

```ts
// In a scene or an object
import { damageNumber, floatText } from '@blacklight/ui';

damageNumber(this.game, enemy, 42, { critical: true });
floatText(this.game, chest, '+1 KEY', { color: '#ffd60a' });
```

<LiveExample src="concepts/world-ui" hint="UI anchored to game objects: health bars follow the enemies while the camera pans. Click an enemy to hit it (a floating damage number rises from it); a red bar at the edge points to the one off screen." />

## WorldAnchor

| Prop     | Default          | Meaning                                                                                                  |
| -------- | ---------------- | -------------------------------------------------------------------------------------------------------- |
| `target` | required         | A game object (any Pixi container), or `{ scene, x, y }` for a world point of a scene.                   |
| `offset` | `{ x: 0, y: 0 }` | Offset in virtual pixels (`y: -90` above a character).                                                   |
| `align`  | `'bottom'`       | Point of the content placed on the target: `bottom` (content above), `center` or `top`.                  |
| `margin` | `0`              | Distance beyond the screen edge, in virtual pixels, before the content hides.                            |
| `clamp`  | `false`          | Instead of hiding, stay at the nearest screen edge (off-screen indicators); the slot receives `clamped`. |

The content is hidden (`visibility: hidden`, `data-offscreen` set) while the target is outside the visible screen, and when the object is destroyed. The visible screen is the whole window in `extend` mode, not only the design area. Anchors are `pointer-events: none`; give interactive children `pointer-events: auto`.

`worldToUi(game, target, { offset, margin })` returns `{ x, y, onScreen }` in UI coordinates for your own code; `visibleArea(game)` returns the visible rectangle.

## Floating texts

`floatText(game, target, text, options)` shows a text that pops, rises and fades over the target. It is anchored to the world point under the target when spawned: the camera can move under it, but it does not follow a moving enemy. `damageNumber(game, target, amount, options)` is a preset: red, yellow and bigger with `critical`, green with `+` with `heal`, and a small horizontal spread so successive hits do not overlap.

| Option      | Default  | Meaning                                                     |
| ----------- | -------- | ----------------------------------------------------------- |
| `color`     | `'#fff'` | CSS color.                                                  |
| `size`      | `40`     | Font size in virtual pixels (times the player's text size). |
| `duration`  | `900`    | Lifetime in ms.                                             |
| `rise`      | `90`     | Distance risen, virtual pixels.                             |
| `offset`    | none     | Offset from the target.                                     |
| `className` | none     | Extra class (`bl-float--critical` for critical hits).       |

Floating texts are drawn under every screen (they belong to the game view), with a black outline; style them with `.bl-float`. With reduced motion they do not rise.

## Limits

- Anchors follow the main camera of the object's scene; in split screen, an object seen by several cameras gets one anchor, at its position in the main view.
- Rotation and scale of the target do not affect the anchored content.
- Many anchors (hundreds) update every frame in the DOM; for crowds, draw labels in Pixi instead.
