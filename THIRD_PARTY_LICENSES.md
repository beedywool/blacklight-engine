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

## Added in phase 3a (UI complete)

Runtime (inside games, through `@blacklight/ui`):

| Package | Version | License | Used by                                                  |
| ------- | ------- | ------- | -------------------------------------------------------- |
| inkjs   | 2.4.0   | MIT     | @blacklight/ui (Ink runtime), @blacklight/cli (compiler) |
| pixi.js | 8.22.0  | MIT     | @blacklight/ui (FX filters, overlay canvas)              |

Tooling (`@blacklight/cli`, build time only, never inside games):

| Package             | Version | License                                                                                | Used by             |
| ------------------- | ------- | -------------------------------------------------------------------------------------- | ------------------- |
| subset-font         | 2.9.0   | BSD-3-Clause                                                                           | @blacklight/cli     |
| harfbuzzjs          | 1.6.4   | MIT (HarfBuzz "Old MIT")                                                               | subset-font         |
| fontverter          | 2.0.0   | BSD-3-Clause                                                                           | subset-font         |
| wawoff2             | 2.0.1   | MIT                                                                                    | fontverter          |
| woff2sfnt-sfnt2woff | 1.0.0   | MIT                                                                                    | fontverter          |
| pako                | 1.0.11  | MIT AND Zlib                                                                           | woff2sfnt-sfnt2woff |
| p-limit             | 3.1.0   | MIT                                                                                    | subset-font         |
| yocto-queue         | 0.1.0   | MIT                                                                                    | p-limit             |
| argparse            | 2.0.1   | Python-2.0 (PSF, permissive; used by wawoff2's command line, which the CLI never runs) | wawoff2             |

Assets:

| Asset                                                                        | License | Origin                                                                        |
| ---------------------------------------------------------------------------- | ------- | ----------------------------------------------------------------------------- |
| templates/visual-novel portraits, gallery images, sounds, music, intro video | CC0     | Generated for the template by `e2e/fixtures/generate-visual-novel-assets.mjs` |
