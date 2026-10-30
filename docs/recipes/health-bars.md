# Health bars over enemies

Health bars, name tags and "press A" hints are DOM elements anchored to game objects with `WorldAnchor`. The anchor reads the object's screen position after each frame is drawn, through cameras, zoom and layers, so the bar never lags behind a moving enemy, and it hides when the object leaves the screen or is destroyed. The bar itself is the `Gauge` widget, which drains with a trail when the value drops.

<LiveExample src="recipes/health-bars" hint="Click the slimes." />

The scene keeps one entry per enemy in a reactive list and opens a single screen that draws an anchor per entry. Two details matter:

- **Shallow reactivity.** Game objects are Pixi containers: a deep `reactive()` would wrap them in proxies, which is slow and breaks identity checks. `shallowReactive` tracks the list and each entry's `hp` and leaves the objects alone. In a `.vue` screen, pass objects through props and keep them out of `ref()`.
- **One screen for all bars.** `ui.open` places the screen over the game without blocking input, like a HUD. A screen per enemy would work too, but one list renders and updates faster.

The `pointer` behavior added with `addBehavior` makes each slime clickable; its hit test uses the object's hitbox, so clicks between the eyes count. For many labels (hundreds), DOM anchors cost a style update each per frame: draw them with Pixi `Text` objects as children of the enemies instead.

See [World-anchored UI](../guide/ui-world), [Gauge](../guide/ui-widgets#gauge) and [pointer](../behaviors/pointer).
