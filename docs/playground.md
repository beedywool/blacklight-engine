---
layout: page
title: Playground
aside: false
---

<BlPlayground />

<div class="bl-play-notes">

## Playground

A whole game project in the browser: `game.config.ts`, a scene, two objects, an animation file with its sprite sheet, and two screens. Edit any file and the game restarts with the change after a short pause. The address bar holds the project at all times (compressed in the part after `#`), so copying it, or pressing **Share**, gives a link that opens this exact project. The fragment after `#` is never sent to the server.

Files follow the [project layout](/guide/project-layout): `scenes/<name>/<name>.scene.ts`, `objects/<name>/<name>.object.ts`, screens in `ui/`, and the `@objects`, `@ui` and `@assets` aliases. Add a file with its full path (`objects/enemy/enemy.object.ts`), and replace an image by picking it and choosing a file from your computer.

### Limits

- Screens are `.ts` files that return render functions (`defineComponent` and `h` from `vue`), because the playground has no `.vue` compiler. In a game, the same screen is a `.vue` file.
- Code may import `@blacklight/core`, `@blacklight/ui`, `vue`, `pixi.js` and the project's own files. `@blacklight/three`, `@blacklight/physics`, `@blacklight/net` and modules from `game.config.ts` are not available here.
- Types are not checked in the browser; type errors show up only when they break at run time. `pnpm typecheck` in a real project checks them.
- Modules that import each other in a circle are refused with an error naming the files.
- An image you add is stored in the link as a `data:` URL, so large images make long links. Browsers accept links of several megabytes, but some chat apps cut them.
- A link runs the code it contains when opened, as on any code playground. The docs site keeps no account or private data that this code could reach.

</div>

<style>
.bl-play-notes {
  max-width: 760px;
  margin: 24px auto 64px;
  padding: 0 24px;
}
</style>
