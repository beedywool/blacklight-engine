# Decisions

Every choice `SPEC.md` left open, one line each: `date · topic · choice · why`.

- 2026-10-29 · npm scope · keep `@blacklight`, `create-blacklight`, `blacklight-vscode` · none of these names has a published package (registry 404, scope search empty). npmjs.com refuses unauthenticated checks of org ownership, so the owner must create the `blacklight` npm org before the first publish; if it is taken, switch to `@blacklight-engine` and record it here.
- 2026-10-29 · TypeScript version · 6.0.3, not 7.0 · typescript-eslint 8.72 (required for linting) supports TypeScript < 6.1; move to 7 when typescript-eslint supports it.
- 2026-10-29 · package manager · pnpm 12.16.1, installed by each developer (https://pnpm.io/installation) and pinned in `packageManager` · current release at project start; contributors install pnpm and the dependencies before anything else, no wrapper. Install scripts are opt-in (`allowBuilds` in `pnpm-workspace.yaml`): only esbuild for now.
- 2026-10-29 · Vite entry · the CLI writes `index.html` and `main.ts` into `<game>/.blacklight/` (git-ignored) and roots Vite there · games have no boilerplate HTML or bootstrap file, and the output lands at `dist/index.html` without renaming.
- 2026-10-29 · build base URL · `./` (relative) · the same web build must load from a web path, Electron's custom protocol and Capacitor's WebView.
- 2026-10-29 · scene discovery · `import.meta.glob('../scenes/*/*.scene.{ts,js}')`, file name must equal folder name · one chunk per scene (RT-03) with no registration code; the name check catches typos at startup.
- 2026-10-29 · config validation · hand-written validator in core, no schema library · keeps `@blacklight/core` small (NF-04); errors list every field with its fix.
- 2026-10-29 · display objects before RT-05 · core re-exports PixiJS `Container`, `Graphics`, `Sprite`, `Text` · templates import only from `@blacklight/core`; the engine's own classes replace them in phase 1 under the same names.
- 2026-10-29 · fixed-step epsilon · 1e-6 ms tolerance in the accumulator · float drift otherwise drops a step (144 frames of 1000/144 ms made 59 steps instead of 60).
- 2026-10-29 · docs fonts · Google Sans Flex (SIL OFL 1.1) bundled from blacklight-website · OFL is not in SPEC §9's list but allows bundling and redistribution with any software; it is used only by the docs site, never shipped in games.
- 2026-10-29 · docs branding · BlackLight black theme and hanging-bulb logo from blacklight-website · owner asked for the docs to follow blacklight-sso / blacklight-website.
- 2026-10-29 · engine linking for local tests · `create-blacklight --link <checkout>` writes `link:` dependencies; the dev server allows the linked workspace in `server.fs.allow` · lets the phase gates scaffold and run a real project against unpublished packages.
