# Benchmarks

Measurements for the non-functional requirements of the spec (NF-01 to NF-04), per target. Each row says how the number was taken and on what. A row without a number has not been measured yet; this page says so rather than estimating.

## Size (NF-04)

Requirement: `@blacklight/core` without Pixi, Vue and Three under 150 KB gzip.

| Measure                        | Result       | How                                                                                                                                                     |
| ------------------------------ | ------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `@blacklight/core` main bundle | 59.6 KB gzip | `packages/cli/test/core-size.spec.ts`: the built package bundled and minified by Vite with Pixi, Vue and Three left out (Motion included), gzip level 9 |
| Chunks loaded on demand        | 44.9 KB gzip | same test; the SDL gamepad database, fetched when the first gamepad connects                                                                            |

The test fails when the main bundle reaches 150 KB, so the number above cannot drift past the limit unnoticed. It was taken on 2026-10-30, after phase 4.

## Frame rate (NF-01)

Requirement: stable 60 fps on a Samsung Galaxy A54 and an iPhone 12 with 300 animated sprites and an animated UI screen.

Not measured yet. The benchmark scene and the regression check in CI come with the release phase; the reference phones are checked by hand (`MANUAL_TESTS.md`).

## Start time (NF-02)

Requirement: cold start under 3 s on desktop; first interactive screen under 5 s on mobile.

Not measured yet.

## Memory (NF-03)

Requirement: under 300 MB on mobile for the party-game template.

Not measured yet.
