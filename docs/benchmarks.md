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

The reference phones have not been measured yet; they are checked by hand (`MANUAL_TESTS.md`, "NF-01 on the reference phones"). The numbers below come from headless desktop Chromium, not from a phone. They serve as the reference for the regression check, not as evidence that NF-01 holds on an A54 or an iPhone 12.

The benchmark is `e2e/fixtures/bench`: 300 `AnimatedSprite`s from an `.anim.json` (6-frame run, 2-frame idle, tinted, scaled, bouncing off the edges) over a background redrawn every frame, under a full-screen Vue screen from `@blacklight/ui` (a looping Motion timeline over eight cards and a ring, a gauge and a counter animating every 400 ms). After a 2 s warm-up the scene measures a 5 s window itself and publishes the result as `window.blacklightBench` and as JSON in `data-bench` on the game element.

```sh
pnpm bench                            # build, run, compare with e2e/bench-baseline.json
BLACKLIGHT_BENCH_UPDATE=1 pnpm bench  # store this machine's results as its baseline
node scripts/bench.mjs update bench-results/*.json  # same, from result files (CI artifact)
```

`e2e/bench.spec.ts` runs the release build five times per viewport in fresh browser contexts, with no CPU throttling, and keeps the median of each metric. It fails when a gated metric is more than 10 % worse than the baseline of the same runner. The method and the reasons for it are in the comment at the top of the spec.

Headless desktop Chromium 2026-10-30, Ryzen 7 9700X, Radeon RX 6650 XT (ANGLE on Vulkan), Linux. Median of 5 runs, 5 s each:

| Metric                                         | 1920×1080 | 915×412 at 2.625× (A54 viewport) | Gated |
| ---------------------------------------------- | --------- | -------------------------------- | ----- |
| Average fps                                    | 59.8      | 59.8                             | yes   |
| 1 % low fps                                    | 59.5      | 59.5                             | yes   |
| Mean frame interval                            | 16.67 ms  | 16.67 ms                         | no    |
| p99 frame interval                             | 16.8 ms   | 16.8 ms                          | no    |
| Frame work (main thread, rendering task)       | 1.25 ms   | 1.24 ms                          | yes   |
| p99 frame work                                 | 2.1 ms    | 2.0 ms                           | no    |
| Main-thread busy per frame (DevTools protocol) | 1.22 ms   | 1.18 ms                          | yes   |
| Game ticker work per frame                     | 0.41 ms   | 0.41 ms                          | yes   |
| JS heap after GC                               | 9.5 MB    | 9.5 MB                           | yes   |

Headless Chromium caps the frame rate at 60, so fps and 1 % low stay at 60 on this machine; the per-frame work is what moves first, and it uses about 7 % of a 16.7 ms frame. Across repeated sessions the medians stayed within 7 % of each other. With 0.5 ms of busy work added to every frame, frame work rises by 30 to 40 % and the check fails (`the regression check fails when every frame does more work` in the spec).

The same machine with the GPU turned off (SwiftShader, as on CI runners without a GPU) shows what CI measures: at 1920×1080, 26 fps, 1 % low 20 fps, 46 ms of frame work per frame, of which the engine's ticker work is 0.7 ms. The rest is software rendering on the main thread, so CI numbers are compared only with CI baselines.

Limits: `performance.measureUserAgentSpecificMemory()` needs a cross-origin isolated page, which the preview server does not provide, so `memoryMb` is recorded as `null` and the heap figure covers the JS heap only (no GPU textures, no DOM).

## Start time (NF-02)

Requirement: cold start under 3 s on desktop; first interactive screen under 5 s on mobile.

Not measured yet.

## Memory (NF-03)

Requirement: under 300 MB on mobile for the party-game template.

Not measured yet.
