# What is Blacklight Engine?

Blacklight Engine is an open-source (MIT) TypeScript framework for making games the way web developers make apps. A game is a set of scenes; each scene is a class with `create()`, `update()` and `destroy()`; the things in a scene are objects, also classes, with behaviors attached for movement and controls. Rendering is PixiJS (WebGL, WebGPU when available); light 3D comes from Three.js sharing the same context; menus and HUDs are Vue 3 components drawn over the canvas.

The same project builds for the web (installable and offline), Windows, macOS, Linux, Android, iOS and Steam with one command per target. Nothing in a game changes between targets: platform differences (gamepads through SDL on desktop, the Android back button, secure storage) live behind engine APIs.

## Where it comes from

The engine grew out of numx-remake, a port of a Clickteam Fusion party game to HTML and JavaScript. That port proved a few patterns worth keeping: one class per scene with named events, a fixed 60 Hz logic step independent of the display, ready-made movements, animation fallback when a direction is missing, and an Electron shell that serves the game through a custom protocol so `fetch()` keeps working offline. It also showed what to leave behind: numbered directions and animations, values indexed A to Z, global asset dumps, and menus drawn as canvas sprites.

## What it is not

There is no visual editor and no event sheet: game logic is code. Visual tools (scene placement, animation preview, UI timelines) live in the VS Code extension and edit the same TypeScript and JSON files you would write by hand. The engine is not a 3D engine either: 3D models are placed inside 2D scenes. It does not ship monetization, mod support or over-the-air updates; updates go through the stores.

## Status

The engine is in development towards 1.0. [Getting started](./getting-started) describes what runs today; the [accepted limitations](./limitations) page lists what will stay true after 1.0.
