# Neon Rain (visual novel)

A Blacklight Engine template: an Ink story with portraits, voice, choices and variables, a dialogue
box with typewriter, auto and skip modes, a backlog, save/load slots, a gallery, an intro cutscene
with subtitles, and Persona-style menus. The story and the menus exist in English, Japanese and
Arabic (right to left); switch in SETTINGS › LANGUAGE.

```sh
pnpm install
pnpm dev
```

| Where             | What                                                                                                 |
| ----------------- | ---------------------------------------------------------------------------------------------------- |
| `stories/<lang>/` | The Ink story, one file per language with the same knots and choices                                 |
| `locales/`        | Menu texts, speaker names and the translations of the engine's ready-made screens (`bl.*`)           |
| `scenes/title`    | Title screen: logo through the FX layer, a lantern with a world-anchored tag, click it for `+1`      |
| `scenes/story`    | Backgrounds drawn in Pixi; reads the `bg`, `transition`, `fx` and `unlock` tags of the story         |
| `scenes/gallery`  | Images unlocked by `# unlock: <id>` in the story                                                     |
| `ui/state.ts`     | Stories by language, save slots (`fileSlots`, plain JSON) and gallery unlocks                        |
| `assets/`         | Placeholder portraits, gallery images, sounds, music and the intro video (WebM VP9 with alpha + MP4) |

Ink tags used by the story: `portrait: <character> <expression> [left|center|right]`, `expression`,
`hide`, `clear`, `voice`, `sfx`, `music` (handled by the engine), `bg`, `transition`, `fx`, `unlock`
(handled by `scenes/story/story.scene.ts`), and `effect`, `color`, `speed` for the whole line.

The placeholder art and sounds are generated (`node e2e/fixtures/generate-visual-novel-assets.mjs`
in the engine repository) and are CC0. Saves use `fileSlots`, which writes plain JSON: replace
`slotsFor` in `ui/state.ts` with an adapter over `game.save` for encrypted saves.
