# My Game

Made with Blacklight Engine.

```sh
pnpm install
pnpm dev                 # http://localhost:5173, reloads on save
pnpm build               # web build in dist/
```

Scenes live in `scenes/<name>/<name>.scene.ts`; the first one is `entry` in `game.config.ts`. Objects shared by
every scene go in `objects/`, UI screens in `ui/`, shared fonts, sounds and images in `assets/`.
