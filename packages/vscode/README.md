# Blacklight Engine for VS Code

Tools for games made with [Blacklight Engine](https://github.com/blacklight-engine/blacklight-engine). The extension activates in folders that contain a `game.config.ts`. Everything it edits stays plain TypeScript or JSON that you can also edit by hand.

| Feature                       | How to open it                                                                                 |
| ----------------------------- | ---------------------------------------------------------------------------------------------- |
| New scene / New object        | Command palette, or right-click `scenes/` / a folder in the explorer                           |
| Snippets and completion       | `bl-` snippets; completion of static properties, animation names, input actions, asset paths   |
| Sprite-sheet slicer           | Right-click a `.png` > **Slice Sprite Sheet**                                                  |
| Animation editor with preview | Open an `.anim.json` > **Open Animation Editor** (editor title)                                |
| Visual scene editor           | `.layout.json` files open in it; **Open Scene Editor** on a `.scene.ts` creates one            |
| UI component preview          | Open a `.vue` screen > **Preview UI Component** (needs `blacklight dev`)                       |
| UI timeline editor            | `.timeline.json` files open in it; **New UI Timeline**                                         |
| Game configuration form       | Open `game.config.ts` > **Edit Game Configuration**                                            |
| Asset browser                 | **Open Asset Browser**: thumbnails, unused files, preload weight per scene                     |
| Debugging                     | **Debug Game in Browser** (breakpoints), the **Live Objects** view (objects, variables, pause) |

`.anim.json`, `.layout.json` and `.timeline.json` files are validated against the engine's JSON Schemas.

The live features (UI preview, Live Objects, Play in game) talk to the game through the dev server started by `blacklight dev`; they do nothing in release builds. See the [tooling guide](https://github.com/blacklight-engine/blacklight-engine/blob/main/docs/guide/vscode.md).
