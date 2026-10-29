# Persona Menu

A Blacklight Engine template: a title screen, a small field to walk around, and a Persona-style
pause menu (items, party, settings with rebinding) driven entirely by gamepad, keyboard, mouse or
touch.

```sh
pnpm install
pnpm dev
```

| Where          | What                                                                                         |
| -------------- | -------------------------------------------------------------------------------------------- |
| `scenes/title` | Title scene; its screen is `ui/TitleScreen.vue`                                              |
| `scenes/field` | The walkable scene; opens `ui/Hud.vue` and pushes `ui/PauseMenu.vue` on `pause`              |
| `ui/`          | Every screen. A screen is a Vue component; `this.ui.push('PauseMenu')` opens it by file name |
| `objects/hero` | The character, moved by the `eightDirections` behavior                                       |

The menu font comes from the system (Impact, Arial Black). Put your own font file in `assets/`
(for example `assets/anton.woff2`) and set `fonts.display` of the theme to `anton`.
