# Benchmarks

Measurements for the non-functional requirements of the spec (NF-01 to NF-04), per target. Each row says how the number was taken and on what. A row without a number has not been measured yet; this page says so rather than estimating.

| Source                                           | Hardware                                                         | NF-01   | NF-02   | NF-03   | Section                                                                              |
| ------------------------------------------------ | ---------------------------------------------------------------- | ------- | ------- | ------- | ------------------------------------------------------------------------------------ |
| Development machine (Linux)                      | Ryzen 7 9700X, Radeon RX 6650 XT                                 | yes     | yes     |         | each requirement below                                                               |
| Android emulator on the development machine      | x86_64 AVD, host GPU                                             | yes     | yes     | yes     | "Android emulator" under each requirement                                            |
| CI runners, full tier                            | GitHub's Linux and macOS runners, Android emulator (SwiftShader) | yes     | yes     | yes     | [CI runners](#ci-runners)                                                            |
| Reference phones (Samsung Galaxy A54, iPhone 12) | the phones                                                       | not yet | not yet | not yet | [Reference phones](#reference-phones), steps in `MANUAL_TESTS.md`                    |
| Real Windows PC                                  | to be noted                                                      | not yet | not yet |         | [Reference phones](#reference-phones) table, steps in `MANUAL_TESTS.md` "Windows PC" |

## Size (NF-04)

Requirement: `@blacklight/core` without Pixi, Vue and Three under 150 KB gzip.

| Measure                        | Result       | How                                                                                                                                                     |
| ------------------------------ | ------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `@blacklight/core` main bundle | 59.6 KB gzip | `packages/cli/test/core-size.spec.ts`: the built package bundled and minified by Vite with Pixi, Vue and Three left out (Motion included), gzip level 9 |
| Chunks loaded on demand        | 44.9 KB gzip | same test; the SDL gamepad database, fetched when the first gamepad connects                                                                            |

The test fails when the main bundle reaches 150 KB, so the number above cannot drift past the limit unnoticed. It was taken on 2026-10-30, after phase 4.

## Frame rate (NF-01)

Requirement: stable 60 fps on a Samsung Galaxy A54 and an iPhone 12 with 300 animated sprites and an animated UI screen.

The reference phones have not been measured yet; they are checked by hand (`MANUAL_TESTS.md`, "Reference phones"). The numbers below come from headless desktop Chromium, not from a phone. They serve as the reference for the regression check, not as evidence that NF-01 holds on an A54 or an iPhone 12.

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

### Android emulator (release app)

`e2e/bench-android.spec.ts` runs the same fixture as a signed release Android app on an emulator or a device. It is part of `pnpm bench` and is skipped unless `BLACKLIGHT_E2E_ANDROID=1` is set and `adb devices` lists a booted emulator or a phone; CI runs it in the `android` job.

```sh
BLACKLIGHT_E2E_ANDROID=1 pnpm exec playwright test --project=bench bench-android        # NF-01, NF-02, NF-03
BLACKLIGHT_E2E_ANDROID=1 pnpm exec playwright test --project=bench bench-android -g NF-01
```

The app is the APK that `blacklight build --target android --release` writes, signed with a throwaway key, with one change the spec makes and nothing else can: WebView inspection is turned back on in the APK's `capacitor.config.json`, and Gradle builds it again. A shipped release refuses DevTools on purpose (SEC-07), and a release build offers no other way out for the results: Capacitor's console logging is off, `run-as` refuses a non-debuggable app, and WebView does not give its trace events to Perfetto for non-debuggable apps on a user build. The change lives in the spec; the CLI, the engine and the templates have no switch for it. Each run starts a fresh app process (`am force-stop`, `am start`), connects over the DevTools protocol (Playwright's `_android`) during the warm-up, and reads the scene's result. The JS heap is taken after a garbage collection forced over the protocol, since a WebView page cannot call `gc()`; the scene's own `performance.memory` figure (coarse, before GC) is kept as `heapNoGcMb`. The memory of the app's processes (see NF-03) is recorded with each run. Five runs, gated as on desktop: the best run of `stepRelative` and of the heap, and fps and 1 % low because the baseline keeps up with the display. There is no absolute fps check: an emulator is not an A54.

x86_64 emulator on this machine, not a reference phone: AVD `Medium_Phone_API_36.1` (Android 16, Google Play image, 1080×2400 at 420 dpi, 2 GB), started headless with `-gpu host` (the Radeon RX 6650 XT through the emulator's GLES translator), WebView 156.0.8078.47, host Ryzen 7 9700X, 2026-10-31. The app runs in landscape at 914×411 CSS pixels and 2.625×. Median of 5 runs (second of the two validation sessions):

| Metric                                    | Emulator, release app | Gated          |
| ----------------------------------------- | --------------------- | -------------- |
| Average fps                               | 59.8                  | yes (best run) |
| 1 % low fps                               | 59.5                  | yes (best run) |
| p99 frame interval                        | 16.8 ms               | no             |
| Game ticker work per frame                | 0.45 ms               | no             |
| Frame run back to back                    | 0.237 ms              | no             |
| `stepRelative` (frame / calibration loop) | 0.245                 | yes (best run) |
| JS heap after GC (DevTools protocol)      | 8.7 MB                | yes (best run) |
| JS heap, `performance.memory`, before GC  | 22 MB                 | no             |
| PSS, app process + WebView renderer       | 100 + 128 = 230 MB    | no             |

The emulator shows the 300 sprites and the animated screen at the display's 60 fps; the best run of each session had a 1 % low of 59.5, single runs dropped to 45. Across the two sessions the best `stepRelative` was 0.2249 and 0.2353 (+4.6 %); single runs ranged from 0.225 to 0.265. With 30 % of the frame's cost added as busy work (`?burn=`, the page reloaded at `https://localhost/?burn=<ms>` over DevTools, against clean runs reloaded at `https://localhost/`), `stepRelative` rose by 32.4 % and 29.2 % and the check reported a regression both times. `frameWorkMs` reads about 18 ms in a WebView although frames come every 16.7 ms: the message the scene posts from a frame runs only after the next one there, so the figure says nothing about the work and is recorded only.

The WebView version matters more than anything the engine did: the Play Store updated WebView from 134 to 156 during this work, and `stepRelative` of the same APK fell from about 0.42 to 0.24. The WebView's major version is therefore part of the runner's name, so a new one starts a new baseline instead of comparing with the old one. CI uses a Google APIs image without the Play Store, whose WebView does not change.

Limits: the emulator runs x86_64 code on a desktop CPU and draws through the desktop GPU, so its fps says nothing about an A54's; the reference phones are checked by hand (`MANUAL_TESTS.md`, "Reference phones", which includes running this spec on the A54). CI's emulator draws with SwiftShader, so its fps is compared only if its baseline reaches 55 fps.

## Start time (NF-02)

Requirement: cold start under 3 s on desktop; first interactive screen under 5 s on mobile.

This section covers the desktop half, for the two reference templates (party-game and visual-novel), as a packaged desktop app and as a web build in desktop Chromium, then the mobile half on an Android emulator.

Cold start is the time from launching the game to the first frame of its entry scene with the game taking input: the title screen is on screen and a key does something. The engine marks that moment with the user timing mark `blacklight:interactive`, set in the first frame after `data-blacklight-state` turns `running` (the entry scene is created and input is attached), once Pixi has rendered that frame. The mark also shows in DevTools' Performance panel, so a game's own start can be read the same way.

```sh
pnpm bench                                               # NF-01 and NF-02
pnpm exec playwright test cold-start --project=bench     # NF-02 only
BLACKLIGHT_BENCH_LAUNCHES=15 pnpm exec playwright test cold-start --project=bench
```

`e2e/cold-start.spec.ts` measures:

- **Desktop**: the packaged release app of the host OS, built with `blacklight build --target <os> --dir` (the unpacked folder an installer would install: fuses set, ASAR with its integrity check, main process as V8 bytecode), started from its executable. Every launch is a fresh process with a fresh profile: empty temporary data, config and cache folders, so no V8 code cache, no GPU shader cache and no saved settings. A release app refuses `--inspect` and `--remote-debugging-port`, so Playwright cannot attach to it; the spec starts it with Chromium's startup tracing (`--trace-startup=blink.user_timing`), reads the mark's timestamp from the trace and subtracts the moment just before `spawn`. Both come from the OS monotonic clock, which Node and Chromium share. The time is split into `navigationMs` (process start, Electron, the main process and its native modules, the window, up to the page's navigation) and `pageMs` (the page, from navigation to the mark).
- **Web**: the release web build served on localhost by `blacklight preview`, opened at 1920×1080 in a newly launched Chromium with a fresh profile (no HTTP cache, no service worker, no code cache). The time is the mark's `startTime`, which counts from the start of the navigation. Network time is left out: it depends on the host, not the engine.

The OS file cache is not under control: emptying it needs root (`drop_caches` on Linux, `purge` on macOS). One unmeasured launch per app comes first, so every measured launch reads the app's files from the cache. The first launch after a reboot reads them from the disk and is slower; it is checked by hand (`MANUAL_TESTS.md`, "NF-02: cold start on real Windows and Mac hardware").

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

Limits: the numbers come from one Linux machine with a hardware GPU. CI measures the Linux and macOS runners (virtual machines without a real GPU) against the 3 s limit only and records the numbers ([CI runners](#ci-runners)); the 10 % comparison runs locally (`DECISIONS.md` 2026-11-02). Real Windows and Mac hardware and the first launch after a reboot are in `MANUAL_TESTS.md`. The web figure excludes download time, so it says how fast the engine starts a page, not how fast a game loads over a network.

### Android emulator (release app)

`e2e/bench-android.spec.ts` (see NF-01 above for the build and the DevTools connection) launches the release app of party-game and of visual-novel nine times each, after one unmeasured launch. Every launch starts from nothing: `am force-stop`, then `pm clear`, which deletes the app's data, its WebView cache and code cache, as on the first launch after installing. The spec runs `date +%s%N; am start -W -n <id>/.MainActivity` in one `adb shell` command and takes the device's clock just before `am start` as the launch. The end is the same `blacklight:interactive` mark as on desktop, read from the page as `performance.timeOrigin` plus the mark's `startTime`, on the same device clock. The spec connects to the WebView only once 5 s have passed since the launch, so a start under the limit is never slowed by the measure. The system's own launch time (`TotalTime` of `am start -W`, the activity's first frame, before the page exists) is recorded as `activityMs`. The gate is the desktop one with the mobile limit: the median under 5 s and within 10 % of the runner's baseline, nine more launches before failing, no change under two frames counted.

x86_64 emulator on this machine (the AVD of NF-01, WebView 156), 2026-10-31. Median of 9 launches in the first session (the stored baseline) and the second:

| Template     | Start to first interactive frame (median) | Range of single launches | Split (second session)                                      |
| ------------ | ----------------------------------------- | ------------------------ | ----------------------------------------------------------- |
| party-game   | 453 ms, then 431 ms                       | 355 to 568 ms            | 169 ms to navigation, 262 ms of page; activity drawn 222 ms |
| visual-novel | 358 ms, then 377 ms (18 launches)         | 305 to 483 ms            | 179 ms to navigation, 205 ms of page; activity drawn 222 ms |

Both templates are interactive in under a tenth of the 5 s limit on the emulator. Single launches spread by ±20 % around the median; in the second session the first nine launches of visual-novel came out more than 10 % above the baseline, the nine more the gate then measures brought the median of eighteen to +5.2 %, and the test passed. Proof that the check catches a slower start: the fixture is built twice, the second time with `VITE_BENCH_STARTUP_DELAY_MS` at 30 % of the first build's median start (125 and 129 ms); the median rose by 28.2 % and 17.4 % and was reported as a regression both times. Part of the busy-wait overlaps work the app does in parallel (the page starts while the activity is still being drawn), so a delay in the entry scene does not add all of its length; together with the spread above, a slowdown has to be about 20 % or more to fail reliably on the emulator.

Limits: an x86_64 emulator with a fast desktop CPU and SSD starts apps much faster than an A54 reads and compiles from its flash, so these numbers show the engine's share, not a phone's start time. The OS file cache is not emptied (one unmeasured launch per app comes first, as on desktop); `pm clear` empties the app's caches only. The A54 and the iPhone 12 are measured by hand (`MANUAL_TESTS.md`, "Reference phones").

## Memory (NF-03)

Requirement: under 300 MB on mobile for the party-game template.

`e2e/bench-android.spec.ts` plays three party sessions in the release app (built as in NF-01). Memory is the proportional set size (PSS, `dumpsys meminfo`, the share of shared pages each process is charged for) of two processes: the app's own (Java, Capacitor, WebView's browser side and its GPU thread) and the WebView renderer it binds, a sandboxed process with its own uid that holds the page: the JS heap, the DOM and the engine. The spec finds the renderer through `dumpsys activity services <package>`. Each session starts with `am force-stop` and `pm clear`, waits 8 s on the title screen and samples it before any DevTools connection. It then connects, gives the page four simulated gamepads (a fake Gamepad API, as in the web e2e tests; the release build has no `window.blacklight` to step), joins four players, starts Survival VS with the default settings and samples memory eight times over about 25 s of the match while the players run left and right. The gate: the highest sample of all sessions under 300 MB, and the median session's peak within 10 % of the runner's baseline (`peakPssMb`, judged on the median session because PSS moves with what other processes share, in either direction).

x86_64 emulator on this machine (the AVD of NF-01, WebView 156), 2026-10-31, three sessions in each of two sessions of the spec:

| Moment                    | App process | WebView renderer | Total (PSS)                            |
| ------------------------- | ----------- | ---------------- | -------------------------------------- |
| Title screen (median)     | 72 MB       | 76 to 78 MB      | 148 to 151 MB                          |
| Four-player match, median |             |                  | 170 to 171 MB                          |
| Four-player match, peak   | 74 to 76 MB | 97 to 102 MB     | 177 MB (highest sample, both sessions) |

The peak is 59 % of the limit. The median session's peak was 173.4 MB, then 173.7 MB (+0.2 %); sessions within one run differed by at most 4 %. The renderer is more than half of the total, so the app process alone would understate the game. The figures during the match include the DevTools connection the spec needs to drive the players, so they are an upper bound. Right after the Play Store had updated WebView during this work, one session read 245 to 260 MB at the peak and 171 to 234 MB at the title, about 45 % more for the same APK; an hour later the figures above held in both sessions. The cause was not looked into (the new WebView not yet compiled in the background is the likely one). Such a session fails the 10 % check against the baseline without any change in the game: on a Play image, run the spec again once the update has settled. CI's image has no Play Store.

Limits: the emulator draws through the host GPU, so textures and other GPU memory are not in its PSS (`Graphics: 0`); on a phone they are, and they add to the total. The A54 figure with the `Graphics` line, and the iPhone 12 (whose web content process WebKit accounts for separately), are measured by hand (`MANUAL_TESTS.md`, "Reference phones"). The session plays one mini-game for 25 s with four players; the other five mini-games and eight players are not part of the measure. For comparison, the NF-01 fixture (300 sprites at 2.625× in a 1920×1080 extended stage) takes 230 MB on the same emulator.

## CI runners

The full tier of CI (`.github/workflows/ci.yml`, nightly and on demand) runs the same specs with `BLACKLIGHT_BENCH_LIMITS_ONLY=1`: they check the spec's absolute limits and record the results as the artifacts `bench-results-<os>` and `bench-results-android`, without comparing them with a baseline. Shared runners vary by more than the 10 % the comparison detects, so that gate runs locally (`DECISIONS.md` 2026-11-02, a deviation from SPEC §11.1). None of these machines has a real GPU: GitHub's Linux runner and its Android emulator draw with SwiftShader on the CPU, and the macOS runner is a virtual machine whose "Apple Paravirtual device" shares the host's GPU. The 60 fps limit of NF-01 is therefore checked only where `isHardwareGpu` (`scripts/bench.mjs`) finds a real GPU, which is none of them; the numbers below show the runners, not the engine on a player's machine.

Runs: full tier 41520055541 on 2026-11-02 (commit 9822e8d: Linux, Android emulator, macOS cold start) and the macOS bench run 41530099917 on 2026-11-02 (commit 98364ad, macOS frame rate at both viewports). Median of 5 runs for NF-01, median of 9 launches for NF-02, three sessions for NF-03.

### NF-01 frame rate (300 animated sprites and an animated UI screen)

| Runner                                 | Renderer                                           | Viewport          | Average fps | 1 % low | Frame work | Game ticker work | JS heap |
| -------------------------------------- | -------------------------------------------------- | ----------------- | ----------- | ------- | ---------- | ---------------- | ------- |
| `ubuntu-latest`                        | SwiftShader (Vulkan)                               | 1920×1080         | 8.2         | 6.7     | 129.9 ms   | 2.57 ms          | 9.7 MB  |
| `ubuntu-latest`                        | SwiftShader (Vulkan)                               | 915×412 at 2.625× | 7.3         | 6.7     | 143.5 ms   | 2.64 ms          | 9.7 MB  |
| `macos-latest`                         | ANGLE Metal, Apple Paravirtual device              | 1920×1080         | 28.2        | 12.0    | 8.7 ms     | 1.31 ms          | 10.0 MB |
| `macos-latest`                         | ANGLE Metal, Apple Paravirtual device              | 915×412 at 2.625× | 32.2        | 13.3    | 11.3 ms    | 2.66 ms          | 10.0 MB |
| Android emulator (API 35, WebView 124) | SwiftShader through the emulator's GLES translator | 914×411 at 2.625× | 29.0        | 7.1     | 24.4 ms    | 5.29 ms          | 8.6 MB  |

The game ticker work, the engine's own share of a frame, stays between 1.3 and 5.3 ms on every runner; the rest of the frame is the software or virtual GPU. The macOS runner drew the same scene at 34 fps in run 41520055541, which the NF-01 check then held to 60 fps until the virtual adapter was excluded.

### NF-02 cold start (median of 9 launches)

| Template     | Target                    | `ubuntu-latest` | `macos-latest` | Android emulator (API 35) |
| ------------ | ------------------------- | --------------- | -------------- | ------------------------- |
| party-game   | desktop app               | 543 ms          | 541 ms         |                           |
| visual-novel | desktop app               | 524 ms          | 618 ms         |                           |
| party-game   | web, Chromium (localhost) | 378 ms          | 322 ms         |                           |
| visual-novel | web, Chromium (localhost) | 348 ms          | 354 ms         |                           |
| party-game   | release app               |                 |                | 1794 ms                   |
| visual-novel | release app               |                 |                | 1185 ms                   |

Every start is well under the limits (3 s desktop, 5 s mobile). The macOS figures come from run 41530099917; run 41520055541 measured 594, 560, 280 and 394 ms for the same four rows.

### NF-03 memory on the Android emulator (party-game, four-player Survival VS)

| Moment                | App process | WebView renderer | Total (PSS) |
| --------------------- | ----------- | ---------------- | ----------- |
| Title screen (median) | 53.2 MB     | 47.8 MB          | 101 MB      |
| Match, peak (median)  | 58.4 MB     | 74.9 MB          | 132.5 MB    |

The emulator keeps GPU memory on the host, so these figures leave textures out, as on the development machine's emulator.

## Reference phones

The phones NF-01 to NF-03 name, and a real Windows PC, are measured by hand (`MANUAL_TESTS.md`, "Reference phones" and "Windows PC"). Nothing has been measured on them yet; fill in a row per measurement with the date and the OS, WebView or browser version.

| Device             | Build        | NF-01 fps (1 % low) | NF-02 start  | NF-03 peak memory | Date and versions |
| ------------------ | ------------ | ------------------- | ------------ | ----------------- | ----------------- |
| Samsung Galaxy A54 | release app  | not measured        | not measured | not measured      |                   |
| Samsung Galaxy A54 | Chrome       | not measured        |              |                   |                   |
| iPhone 12          | release app  | not measured        | not measured | not measured      |                   |
| iPhone 12          | Safari       | not measured        |              |                   |                   |
| Windows PC         | `pnpm bench` | not measured        | not measured |                   |                   |
