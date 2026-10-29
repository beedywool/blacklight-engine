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

## Relay server (Docker image; desktop builds that host LAN games)

| Package | Version | License | Used by                                                  |
| ------- | ------- | ------- | -------------------------------------------------------- |
| ws      | 8.22.0  | MIT     | @blacklight/relay (bundled into the image's `relay.cjs`) |

`@blacklight/net` and `eslint-plugin-blacklight` have no runtime dependencies.
