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

The mobile half is not measured yet: it needs the Android emulator and is the next step of the benchmark work. This section covers the desktop half, for the two reference templates (party-game and visual-novel), as a packaged desktop app and as a web build in desktop Chromium.

Cold start is the time from launching the game to the first frame of its entry scene with the game taking input: the title screen is on screen and a key does something. The engine marks that moment with the user timing mark `blacklight:interactive`, set in the first frame after `data-blacklight-state` turns `running` (the entry scene is created and input is attached), once Pixi has rendered that frame. The mark also shows in DevTools' Performance panel, so a game's own start can be read the same way.

```sh
pnpm bench                                               # NF-01 and NF-02
pnpm exec playwright test cold-start --project=bench     # NF-02 only
BLACKLIGHT_BENCH_LAUNCHES=15 pnpm exec playwright test cold-start --project=bench
```

`e2e/cold-start.spec.ts` measures:

- **Desktop**: the packaged release app of the host OS, built with `blacklight build --target <os> --dir` (the unpacked folder an installer would install: fuses set, ASAR with its integrity check, main process as V8 bytecode), started from its executable. Every launch is a fresh process with a fresh profile: empty temporary data, config and cache folders, so no V8 code cache, no GPU shader cache and no saved settings. A release app refuses `--inspect` and `--remote-debugging-port`, so Playwright cannot attach to it; the spec starts it with Chromium's startup tracing (`--trace-startup=blink.user_timing`), reads the mark's timestamp from the trace and subtracts the moment just before `spawn`. Both come from the OS monotonic clock, which Node and Chromium share. The time is split into `navigationMs` (process start, Electron, the main process and its native modules, the window, up to the page's navigation) and `pageMs` (the page, from navigation to the mark).
- **Web**: the release web build served on localhost by `blacklight preview`, opened at 1920×1080 in a newly launched Chromium with a fresh profile (no HTTP cache, no service worker, no code cache). The time is the mark's `startTime`, which counts from the start of the navigation. Network time is left out: it depends on the host, not the engine.

The OS file cache is not under control: emptying it needs root (`drop_caches` on Linux, `purge` on macOS). One unmeasured launch per app comes first, so every measured launch reads the app's files from the cache. The first launch after a reboot reads them from the disk and is slower; it is checked by hand (`MANUAL_TESTS.md`, "NF-02 cold start on Windows and macOS").

Each app is launched nine times. The test fails when the median launch takes 3 s or more, or is more than 10 % slower than the baseline of the same runner (`e2e/bench-baseline.json`, entries `cold-start-desktop-<template>` and `cold-start-web-<template>`); before failing on the baseline it launches nine more times and the median of the eighteen decides. A change under two display frames (33 ms) never counts: the mark lands on a frame, so a start time moves in steps of 16.7 ms whatever the engine does. The comparison takes the median launch, not the best one as NF-01 does, because desktop launches here come in two modes: about one in five is 20 % faster than the others, in both the process start and the page. The cause was not found (the CPU runs the performance governor without boost). The best launch then depends on whether a fast one happened, and with five launches one session had three of them; with nine the median stays in the common mode.

Linux 2026-10-31, Ryzen 7 9700X, Radeon RX 6650 XT, Electron 44.9.3, Playwright's Chromium 156, normal desktop load (Firefox, Discord, GNOME; load average 1.6 to 2.9). Median of 9 launches (the stored baseline), and the range of the median over that session and three consecutive `pnpm bench` sessions after it:

| Template     | Target                    | Cold start (median) | Fastest launch | Median over sessions | Split                                      |
| ------------ | ------------------------- | ------------------- | -------------- | -------------------- | ------------------------------------------ |
| party-game   | desktop app (Linux, x64)  | 775 ms              | 589 ms         | 719 to 775 ms        | 485 ms to navigation, 290 ms of page       |
| visual-novel | desktop app (Linux, x64)  | 733 ms              | 592 ms         | 709 to 733 ms        | 481 ms to navigation, 262 ms of page       |
| party-game   | web, Chromium (localhost) | 91 ms               | 83 ms          | 83 to 91 ms          | `running` at 74 ms, DOMContentLoaded 45 ms |
| visual-novel | web, Chromium (localhost) | 93 ms               | 77 ms          | 83 to 102 ms         | `running` at 70 ms, DOMContentLoaded 44 ms |

Both templates start in a quarter of the 3 s limit as desktop apps. About two thirds of a desktop start happens before the page exists. For comparison, a bare Electron 44 app that opens a window with a WebGL canvas is interactive after about 280 ms on the same machine, its page after about 47 ms. A startup trace of party-game with the `toplevel` and `v8.execute` categories shows the main process running JavaScript for 321 ms before it creates the window; about 250 ms of it is `require('@kmamal/sdl')`, whose `global_initialize` starts SDL's joystick, game controller, haptic and sensor subsystems (205 to 266 ms when timed alone under Node). It is not changed here: the page asks the `sdl` module for pads when it starts and falls back to the browser's Gamepad API when the module is missing, so starting SDL after the window needs a change to that contract (RT-12), not a one-line move. The page itself takes about 280 ms in the app against about 90 ms in Chromium; the app serves every file through the main process (`app://`), and that part was not broken down further.

Proof that the check catches a slower start: the test `the regression check fails when startup takes 30 % longer` packages `e2e/fixtures/bench` twice, the second time with `VITE_BENCH_STARTUP_DELAY_MS` set to 30 % of the first build's median launch; the fixture busy-waits that long in its entry scene's `create`, before the first frame. Only the fixture reads the variable; the engine and the templates do not. Over the three sessions the delay was 217 to 219 ms and the median launch rose by 29.6 to 31.0 %, reported as a regression each time, while the clean launches compared with themselves were not. Between sessions, the median launch of the same build moved by up to 7 % (desktop) and 10 ms (web), so a slowdown of 15 % or more fails reliably on the desktop app; on the web build the two-frame floor means a slowdown has to cost more than 33 ms, about 35 % of a 90 ms start.

Limits: the numbers come from one Linux machine with a hardware GPU. CI measures Windows, macOS and Linux runners (virtual machines, software rendering), each against its own baseline, which the owner stores from the first green main run (`node scripts/bench.mjs update`); until then CI records the numbers and checks only the 3 s limit. Real Windows and Mac hardware and the first launch after a reboot are in `MANUAL_TESTS.md`. The web figure excludes download time, so it says how fast the engine starts a page, not how fast a game loads over a network.

## Memory (NF-03)

Requirement: under 300 MB on mobile for the party-game template.

Not measured yet.
