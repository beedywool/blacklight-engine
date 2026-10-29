# Third-party licenses

Every dependency that ships inside a game or a published package, and every asset pack. Development-only tools (TypeScript, ESLint, Vitest, Playwright, tsup) are not listed.

## Runtime (inside games)

| Package                 | Version | License      | Used by          |
| ----------------------- | ------- | ------------ | ---------------- |
| pixi.js                 | 8.22.0  | MIT          | @blacklight/core |
| @pixi/colord            | 2.9.6   | MIT          | pixi.js          |
| @xmldom/xmldom          | 0.8.15  | MIT          | pixi.js          |
| earcut                  | 3.2.4   | ISC          | pixi.js          |
| eventemitter3           | 5.0.4   | MIT          | pixi.js          |
| gifuct-js               | 2.1.2   | MIT          | pixi.js          |
| js-binary-schema-parser | 2.0.3   | MIT          | gifuct-js        |
| ismobilejs              | 1.1.1   | MIT          | pixi.js          |
| parse-svg-path          | 0.2.0   | MIT          | pixi.js          |
| tiny-lru                | 11.4.7  | BSD-3-Clause | pixi.js          |

## Tooling packages (published, not inside games)

| Package | Version | License | Used by         |
| ------- | ------- | ------- | --------------- |
| vite    | 8.3.5   | MIT     | @blacklight/cli |
| cac     | 7.1.0   | MIT     | @blacklight/cli |

## Documentation site

| Package or asset              | Version | License                                         |
| ----------------------------- | ------- | ----------------------------------------------- |
| vitepress                     | 1.6.4   | MIT                                             |
| vue                           | 3.5.44  | MIT                                             |
| Google Sans Flex (font files) | —       | SIL Open Font License 1.1                       |
| BlackLight logo               | —       | © BlackLight, used with permission of the owner |

## Tooling added by phase 3g (CLI and VS Code extension)

| Package                  | Version | License    | Used by                                                              |
| ------------------------ | ------- | ---------- | -------------------------------------------------------------------- |
| magic-string             | 1.4.5   | MIT        | @blacklight/cli (hot reload transform, dev only)                     |
| typescript               | 6.0.3   | Apache-2.0 | VS Code extension (bundled: `game.config.ts` form, scene code edits) |
| @blacklight/core (parts) | —       | MIT        | VS Code extension (bundled: animation and sheet resolution)          |

Development tools of the extension, not shipped: @vscode/test-electron 3.1.0 (MIT), @vscode/vsce 4.0.0 (MIT), ovsx 1.3.0 (EPL-2.0, publishing CLI only), @types/vscode 1.125.0 (MIT), happy-dom 21.0.4 (MIT).
