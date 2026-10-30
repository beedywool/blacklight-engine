# Concepts

This page is the model of the engine in one place: what each piece is, who calls whom, and when. Each section links to the guide that covers it in full. The live examples run the real engine; click a preview to give it the keyboard.

## The game

A game is a folder with a `game.config.ts`. The CLI (`blacklight dev`, `blacklight build`) reads it, finds the scenes, objects and screens by their folders, and generates the entry code that calls `createGame`. At run time there is one `Game` object, reachable as `this.game` from scenes, objects and screens. It owns the renderer (PixiJS), the input, the audio buses, the asset store, the saves, the settings and the UI layer. [Configuration](./configuration) lists every field of the config; [Project layout](./project-layout) every folder.

## Scenes

A scene is a class in `scenes/<name>/<name>.scene.ts`: a level, a title screen, a battle. One scene runs at a time (`goto` switches, with a transition), others can be opened over it as overlays or drawn inside it as hosted scenes. Each scene is loaded on demand as its own code chunk, with its declared assets, before `create(params)` runs. When it ends, every object, timer, listener and screen it created is removed with it.

<LiveExample src="concepts/scenes" hint="Press Enter to start a level, Escape to open the pause overlay over it." />

See [Scenes](./scenes).

## Objects

Objects are classes that extend `Sprite`, `Graphics`, `Text`, `Container`, `Particles`, `TilemapLayer` or `Video`, all built on `GameObject`. A scene creates them with `spawn(Class, props)` or `spawn('Name', props)`: by name, objects in `scenes/<scene>/objects/` shadow the global ones in `objects/`. Each object has a position, a hitbox, collision settings, behaviors, timers and its own `update()`. Objects are Pixi containers, so children, filters, masks and blend modes work as in PixiJS.

<LiveExample src="concepts/objects" hint="A container with children, layers and z-order, alpha, tint and a Pixi filter." />

See [Objects](./objects) and [Sprites and animations](./sprites-and-animations).

## Behaviors

A behavior is a piece of logic attached to objects: a movement, a control scheme, an effect. Nineteen ship with the engine (platformer, eight directions, grid movement with A*, drag and drop…), each with its own [page](./behaviors). Writing one is a class with `update(object, dt)` and a function that creates it:

<LiveExample src="concepts/custom-behavior" hint="Objects pulse; Space turns the behavior off and on." />

## The fixed step

Logic runs at a fixed rate, 60 steps per second by default, whatever the display does. One step updates, in order: scene timers, the scene's `update()`, each object (its behaviors, its `update()`, its velocity, its animation, its timers), then collisions (`onCollide`…), tweens and cameras. Rendering happens at the display's rate and interpolates positions between the last two steps, so motion is smooth at 144 Hz and identical at 30 Hz. Timers and tweens run on game time: they stop when the game pauses and slow down with `game.time.scale`. See [Time and events](./time-and-events).

## Layers and cameras

A scene draws its objects in named layers (`static layers = ['back', 'main', 'front']`), plus a `hud` layer in screen space that ignores the camera. Up to four cameras show the world, each on a part of the screen, with follow, bounds, zoom and shake. The whole picture is scaled from the virtual resolution of the config to the window, in `extend` (more world on the long side) or `letterbox` (bars) mode. See [Camera](./camera).

## Input

Code reads named actions (`left`, `jump`, `pause`), never keys. Each action is bound to keys, mouse buttons, touch and gamepad inputs in the config, players can rebind them, and up to eight local players each read their own devices through `this.input`. See [Input](./input).

## The UI layer

Menus, HUDs and dialogue are Vue components in `ui/`, drawn as DOM over the canvas and scaled with it. Screens are stacked (`open` for a HUD, `push` for a menu, `modal` for a dialog), focus moves between elements with a gamepad or the keyboard, and a pushed screen blocks game input until it closes. Effects that need shaders run on a WebGL layer synchronized with the screens.

<LiveExample src="concepts/screens" hint="The HUD is opened by the scene; Escape pushes the menu." />

See [UI layer](./ui) and the pages that follow it in the sidebar.

## Assets and typed names

Files next to a scene or an object belong to it and load with it; shared files go in `assets/`. During `blacklight dev`, the CLI writes `.blacklight/types.d.ts` with the names of your scenes, objects, actions, animations and assets, so `goto('batle')` or `play('rnu')` is a type error. Release builds pack small images into atlases. See [Assets](./assets).

## What runs where

The same game code runs on every target. The platform layer under it changes: the browser on the web (IndexedDB saves, service worker), Electron on desktop (files in the OS data folder, the keystore, SDL gamepads, Steam), Capacitor on mobile. Code that needs Node or native APIs lives in a module's native part, called through a validated bridge; game code never gets Node. See [Modules](./modules), [Desktop and Steam](./desktop) and [Android and iOS](./mobile).

## Limits

- One scene is current at a time; overlays and hosted scenes are drawn with it but are separate scenes with their own objects.
- Live examples on these pages run TypeScript without type-checking it in the browser, and cannot load `@blacklight/three`, `@blacklight/physics`, `@blacklight/net` or modules. 3D, physics, networking and modules are shown with code on their own pages.
