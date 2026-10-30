# Split screen

A scene can draw through up to 4 cameras, each on a part of the screen. Give the main camera the left half, add a second camera for the right half, and make each one follow its player. Objects are not duplicated: both cameras look at the same world, so a player who walks into the other's view shows up there too.

<LiveExample src="recipes/split-screen" hint="Click the preview. Arrows move the white player, WASD the red one." />

```ts
this.camera.viewport = { x: 0, y: 0, width: 0.5, height: 1 };
this.camera.follow(one);
const right = this.addCamera({ x: 0.5, y: 0, width: 0.5, height: 1 });
right.follow(two);
```

Viewports are fractions of the design area, so the split stays right on any window size. For four players use quarters (`{ x: 0.5, y: 0.5, width: 0.5, height: 0.5 }`). Each camera has its own `bounds`, `zoom` and `shake`; a hit on player two can shake only the right half.

The HUD layer and UI screens are drawn once over the whole screen. Put per-player HUD elements in [`Anchor`](../guide/ui-style#anchors-and-safe-area) boxes placed on each half, or draw them in the world and follow the player.

With more than one camera, each view is rendered into its own texture, which costs one extra full-screen draw per camera. See [Camera](../guide/camera) and, for joining players with gamepads, [Local multiplayer](./local-multiplayer).
