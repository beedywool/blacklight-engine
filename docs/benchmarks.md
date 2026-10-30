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

`e2e/bench.spec.ts` runs the release build five times per viewport in fresh browser contexts, with no CPU throttling, and fails when a gated metric of the best run is more than 10 % worse than the baseline of the same runner; when one is, it measures five more runs and the best of the ten decides. The method and the reasons for it are in the comment at the top of the spec and in `DECISIONS.md`.

The gated timing is not the time of a displayed frame. Headless Chromium shows at most 60 frames per second and a frame takes about 1.2 ms here, so the core idles most of the time, and how fast it runs the next frame depends on what else the machine does: with a browser, a chat client and the desktop shell open, the same build measured 1.1 to 1.6 ms of frame work from one run to the next. After the measured window the scene runs 20 bursts of frames back to back (game step, draw, Pixi render, UI timeline and the style it causes), each between two runs of a fixed calibration loop, and reports the median of burst time divided by calibration time (`stepRelative`). Both timings follow the CPU's speed of the moment, so the ratio holds still while more work per frame raises it.

Headless desktop Chromium 2026-10-30, Ryzen 7 9700X, Radeon RX 6650 XT (ANGLE on Vulkan), Linux, normal desktop load (load average 1.3 to 2.4). Median of 5 runs, 5 s window each:

| Metric                                         | 1920×1080 | 915×412 at 2.625× (A54 viewport) | Gated          |
| ---------------------------------------------- | --------- | -------------------------------- | -------------- |
| Average fps                                    | 59.8      | 59.8                             | yes (best run) |
| 1 % low fps                                    | 60.0      | 60.0                             | yes (best run) |
| Mean frame interval                            | 16.67 ms  | 16.67 ms                         | no             |
| p99 frame interval                             | 16.67 ms  | 16.67 ms                         | no             |
| Frame work (main thread, rendering task)       | 1.18 ms   | 1.18 ms                          | no             |
| p99 frame work                                 | 1.95 ms   | 1.89 ms                          | no             |
| Main-thread busy per frame (DevTools protocol) | 1.19 ms   | 1.17 ms                          | no             |
| Game ticker work per frame                     | 0.44 ms   | 0.44 ms                          | no             |
| Frame run back to back                         | 0.243 ms  | 0.245 ms                         | no             |
| `stepRelative` (frame / calibration loop)      | 0.160     | 0.156                            | yes (best run) |
| JS heap after GC                               | 10.0 MB   | 10.0 MB                          | yes (best run) |

The frame uses about 7 % of a 16.7 ms frame, so fps and 1 % low stay at 60 on this machine. Over five consecutive sessions of `pnpm bench` on the desktop as it was, single runs of `stepRelative` ranged from 0.146 to 0.166 (one disturbed run at 0.289, which the best-of-five ignores), and the best run of each session stayed between -3.0 % and +4.8 % of the baseline (0.1506 at 1920×1080, 0.150 at the phone viewport); all sessions passed. With 30 % of the frame's cost added as busy work to every frame, `stepRelative` rose by 29 to 34 % and the check failed, as the test `the regression check fails when every frame does 30 % more work` requires. A slowdown of 15 % or more fails reliably; one between 10 and 15 % fails in most sessions, depending on how close the session's best run comes to the baseline.

The same machine with the GPU turned off (SwiftShader, as on CI runners without a GPU) shows what CI measures: at 1920×1080, 26 fps, 1 % low 20 fps, 47 ms of frame work per frame, of which the engine's ticker work is 0.8 ms; the rest is software rendering. There `stepRelative` is about 0.30 (bursts are kept short so the software renderer can catch up), within 5 % across runs, and fps is not compared (the baseline is under 55 fps). CI numbers are compared only with CI baselines.

Limits: the spec makes the pages cross-origin isolated, but the Chromium build Playwright uses refuses `performance.measureUserAgentSpecificMemory()`, so `memoryMb` is recorded as `null` and the heap figure covers the JS heap only (no GPU textures, no DOM). The gate does not see a regression that only affects displayed frames and not frames run back to back (paint and compositing of the UI, GPU time); such a regression shows in the recorded frame work and, once it costs frames, in fps and 1 % low.

## Start time (NF-02)

Requirement: cold start under 3 s on desktop; first interactive screen under 5 s on mobile.

Not measured yet.

## Memory (NF-03)

Requirement: under 300 MB on mobile for the party-game template.

Not measured yet.
