# Pause menu

A pause menu is a screen pushed over the game when the `pause` action is pressed (Escape, or Start on a gamepad). `push` hides the screens below it and blocks game input while it is open: every `pressed`, `held` and `axis` read by scenes, objects and behaviors returns an idle value, so the ship below stops without any check in its code. `back` (Escape, B) closes a pushed screen by default.

<LiveExample src="recipes/pause-menu" hint="Click the preview, move with the arrows, then press Escape." />

In a game the menu is a file, `ui/PauseMenu.vue`, and the scene opens it by name with `this.ui.push('PauseMenu')`. Live examples define screens in the same file with `defineComponent` and `h` because they have no `.vue` compiler; the components and props are the same as in a template.

## Freezing the game too

Blocking input leaves enemies, timers and animations running, which suits action games where the world keeps moving behind a quick menu. To stop the world as well, pause the game while the screen is open:

```ts
override update() {
  if (this.input.pressed('pause')) {
    this.game.pause();
    void this.ui.push('PauseMenu').result.then(() => this.game.resume());
  }
}
```

A paused game stops the fixed step, so scenes, timers and tweens stop, and the music and sound buses go quiet; the UI layer keeps running on real time, so the menu still animates, plays its sounds and reads input. See [UI layer](../guide/ui#opening-and-closing) for every `push` option and [Ready-made screens](../guide/ui-screens) for a complete `PauseScreen` with settings and quit.
