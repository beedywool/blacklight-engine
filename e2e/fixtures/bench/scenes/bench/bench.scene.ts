import { Graphics, Scene, Text } from '@blacklight/core';
import { UPDATE_PRIORITY } from 'pixi.js';

/** Frames ignored at the start: shader compilation, texture uploads, JIT warm-up. */
export const WARMUP_MS = 2000;
/** Length of the measured window. */
export const MEASURE_MS = 5000;
/** Bursts of back-to-back frames in the throughput measure, and the target length of one. */
const BURSTS = 20;
const BURST_MS = 40;

/** What one run of the benchmark reports (`window.blacklightBench`, `data-bench` on the mount). */
export interface BenchResult {
  sprites: number;
  /** Artificial work added to every frame (`?burn=<ms>`), 0 in a normal run. */
  burnMs: number;
  viewport: { width: number; height: number; dpr: number };
  frames: number;
  /** Frames shown per second over the window. */
  fps: number;
  /** "1 % low": the frame rate of the slowest 1 % of frames (1000 / their mean interval). */
  low1Fps: number;
  /** Mean interval between two displayed frames. */
  frameMs: number;
  /** 99th percentile of the interval between two displayed frames. */
  p99FrameMs: number;
  /**
   * Main-thread time of one frame's rendering task: from the frame's start (the `requestAnimationFrame`
   * timestamp) until the task after it runs, so it covers every animation frame callback (game step,
   * Pixi draw, Motion, Vue updates) and the browser's style, layout and paint of the UI.
   */
  frameWorkMs: number;
  /** Median frame: unlike the mean, a frame delayed by another process does not move it. */
  frameWorkP50Ms: number;
  frameWorkP99Ms: number;
  /** Game's own ticker work per frame: fixed steps, objects, animations, Pixi's draw calls. */
  gameMs: number;
  gameP50Ms: number;
  /**
   * Throughput: main-thread time of one frame run back to back with others (a game step, the
   * scene's draw, Pixi's render, the UI timeline seek and the style and layout it causes), median
   * of {@link BURSTS} bursts. Not gated: it moves with the CPU's speed of the moment.
   */
  stepMs: number;
  /** Median time of the calibration loop, a fixed piece of JavaScript timed next to each burst. */
  calibrationMs: number;
  /**
   * `stepMs` divided by the calibration loop timed just before and after the same burst (median
   * over the bursts). A desktop's CPU changes speed by up to 1.5× from one second to the next
   * (boost, power profile, other programs on the same core); both timings change together, so
   * the ratio stays put while a slower engine still raises it. This is what the regression check
   * relies on.
   */
  stepRelative: number;
  /** JS heap after a garbage collection when the page can trigger one (`--js-flags=--expose-gc`). */
  heapMb: number | null;
  /** `performance.measureUserAgentSpecificMemory()`, only in cross-origin isolated pages. */
  memoryMb: number | null;
}

declare global {
  interface Window {
    blacklightBench?: BenchResult;
    /** Set by the test runner to take its own measures at the window's start and end. */
    blacklightBenchWindow?: (phase: 'start' | 'end') => Promise<void>;
    gc?: () => void;
  }
  interface Performance {
    memory?: { usedJSHeapSize: number };
    measureUserAgentSpecificMemory?: () => Promise<{ bytes: number }>;
  }
}

const mean = (list: number[]) => list.reduce((a, b) => a + b, 0) / list.length;
const percentile = (list: number[], p: number) =>
  [...list].sort((a, b) => a - b)[Math.min(list.length - 1, Math.floor(list.length * p))]!;
const round = (value: number) => Math.round(value * 100) / 100;

// Calibration loop: game-like JavaScript (object fields, branches, math) that never changes with the
// engine, about 1 ms long. Timing it next to the engine tells how fast the CPU runs at that moment.
const particles = Array.from({ length: 4000 }, (_, i) => ({
  x: i % 1000,
  y: i,
  vx: 1,
  vy: -1,
  a: 0,
}));
const weights = new Float32Array(16).fill(1.0001);
function calibrate(): number {
  const start = performance.now();
  for (let pass = 0; pass < 20; pass++)
    for (const p of particles) {
      p.x += p.vx * 0.016;
      p.y += p.vy * 0.016;
      if (p.x > 1000 || p.x < 0) p.vx = -p.vx;
      p.a = Math.sin(p.x) * weights[(p.y | 0) & 15]!;
    }
  return performance.now() - start;
}

/**
 * NF-01 benchmark: 300 animated sprites crossing the screen under an animated UI screen (Motion
 * timeline, gauge, counter). After `WARMUP_MS` it measures `MEASURE_MS` of displayed frames and
 * publishes a {@link BenchResult} as `window.blacklightBench` and as JSON in `data-bench` on the
 * game element. Query parameters: `?sprites=<n>` (default 300), `?burn=<ms>` adds busy work to
 * every frame (used to prove that the regression check fails). The result also shows at the bottom of
 * the screen, for phones where the page cannot be inspected.
 */
export default class Bench extends Scene {
  private readonly options = new URLSearchParams(location.search);
  private readonly burnMs = Number(this.options.get('burn') ?? 0);
  private stripes!: Graphics;

  override create() {
    delete this.game.mount.dataset.bench;
    delete window.blacklightBench;
    const sprites = Number(this.options.get('sprites') ?? 300);
    const back = this.spawn(Graphics, { zIndex: -1 });
    back.draw.rect(0, 0, 4000, 4000).fill(0x101216);
    this.stripes = this.spawn(Graphics, { zIndex: -1 });
    const random = this.game.random;
    for (let i = 0; i < sprites; i++)
      this.spawn('Runner', { x: random.float(0, this.width), y: random.float(0, this.height) });
    this.ui.open('BenchHud');
    void this.measure(sprites);
  }

  override render() {
    // Moving shapes behind the sprites, redrawn every frame like a scrolling background.
    const t = performance.now() / 1000;
    this.stripes.draw.clear();
    for (let i = 0; i < 12; i++)
      this.stripes.draw.rect(((i * 180 + t * 90) % 2160) - 120, 0, 40, this.height).fill({
        color: 0x1c2230,
      });
    if (this.burnMs > 0) {
      const until = performance.now() + this.burnMs;
      while (performance.now() < until);
    }
  }

  /** Bursts of frames run back to back, each between two runs of the calibration loop. */
  private async throughput(): Promise<{ step: number[]; calibration: number[]; ratio: number[] }> {
    const game = this.game;
    const frame = () => {
      game.step(1);
      game.app.render();
      // Applies the UI's new animated values now (style and layout), as a displayed frame would.
      document.body.getBoundingClientRect();
    };
    const burst = (frames: number) => {
      const start = performance.now();
      for (let i = 0; i < frames; i++) frame();
      return (performance.now() - start) / frames;
    };
    const nextFrame = () => new Promise((resolve) => requestAnimationFrame(resolve));
    game.pause();
    // Sizes the bursts so each lasts about BURST_MS whatever the machine, and so the GPU catches
    // up with the burst's frames in about 100 ms: without a GPU (SwiftShader, CI runners) every
    // frame takes the GPU process tens of milliseconds, which the next frame waits for.
    const perFrame = burst(10);
    const drainStart = performance.now();
    // The backlog shows on the second frame after the burst.
    await nextFrame();
    await nextFrame();
    const drain = (performance.now() - drainStart) / 10;
    let frames = Math.min(500, Math.max(5, Math.round(Math.min(BURST_MS / perFrame, 100 / drain))));
    const result = { step: [] as number[], calibration: [] as number[], ratio: [] as number[] };
    for (let i = 0; i < BURSTS; i++) {
      const waitStart = performance.now();
      await nextFrame();
      const wait = performance.now() - waitStart;
      if (wait > 200) frames = Math.max(5, Math.round((frames * 100) / wait));
      const before = calibrate();
      const step = burst(frames);
      const calibration = (before + calibrate()) / 2;
      result.step.push(step);
      result.calibration.push(calibration);
      result.ratio.push(step / calibration);
    }
    game.resume();
    return result;
  }

  private async measure(sprites: number) {
    const intervals: number[] = [];
    const work: number[] = [];
    const game: number[] = [];
    let measuring = false;
    let finished = false;

    // Game work: between the first and the last ticker callbacks (Pixi renders in between).
    const ticker = this.game.app.ticker;
    let gameStart = 0;
    const begin = () => (gameStart = performance.now());
    const end = () => measuring && game.push(performance.now() - gameStart);
    ticker.add(begin, undefined, UPDATE_PRIORITY.INTERACTION);
    ticker.add(end, undefined, UPDATE_PRIORITY.UTILITY);
    this.disposables.add(() => {
      finished = true;
      ticker.remove(begin);
      ticker.remove(end);
    });

    // Frame work: a message posted from an animation frame callback runs once the whole rendering
    // task (every callback, then style, layout, paint) is over.
    const channel = new MessageChannel();
    let frameStart = 0;
    channel.port1.onmessage = () => measuring && work.push(performance.now() - frameStart);
    let last = 0;
    const frame = (timestamp: number) => {
      if (finished) return;
      if (measuring && last) intervals.push(timestamp - last);
      last = timestamp;
      frameStart = timestamp;
      channel.port2.postMessage(0);
      requestAnimationFrame(frame);
    };
    requestAnimationFrame(frame);

    await new Promise((resolve) => setTimeout(resolve, WARMUP_MS));
    if (finished) return;
    await window.blacklightBenchWindow?.('start');
    last = 0;
    measuring = true;
    const started = performance.now();
    await new Promise((resolve) => setTimeout(resolve, MEASURE_MS));
    measuring = false;
    const elapsed = performance.now() - started;
    await window.blacklightBenchWindow?.('end');
    finished = true;
    channel.port1.close();
    if (intervals.length === 0) throw new Error('The benchmark saw no frame: is the tab hidden?');
    const bursts = await this.throughput();

    const slowest = [...intervals]
      .sort((a, b) => b - a)
      .slice(0, Math.max(1, Math.ceil(intervals.length / 100)));
    window.gc?.();
    const heap = performance.memory?.usedJSHeapSize;
    let memory: number | undefined;
    if (crossOriginIsolated && performance.measureUserAgentSpecificMemory)
      // Chromium also refuses it in some builds (headless shell): the heap figure remains.
      memory = await Promise.race([
        performance.measureUserAgentSpecificMemory().then(
          (m) => m.bytes,
          () => undefined,
        ),
        new Promise<undefined>((resolve) => setTimeout(resolve, 10_000)),
      ]);
    const mb = (bytes: number | undefined) => (bytes === undefined ? null : round(bytes / 2 ** 20));
    const result: BenchResult = {
      sprites,
      burnMs: this.burnMs,
      viewport: { width: innerWidth, height: innerHeight, dpr: devicePixelRatio },
      frames: intervals.length,
      fps: round((intervals.length * 1000) / elapsed),
      low1Fps: round(1000 / mean(slowest)),
      frameMs: round(mean(intervals)),
      p99FrameMs: round(percentile(intervals, 0.99)),
      frameWorkMs: round(mean(work)),
      frameWorkP50Ms: round(percentile(work, 0.5)),
      frameWorkP99Ms: round(percentile(work, 0.99)),
      gameMs: round(mean(game)),
      gameP50Ms: round(percentile(game, 0.5)),
      stepMs: Math.round(percentile(bursts.step, 0.5) * 1000) / 1000,
      calibrationMs: Math.round(percentile(bursts.calibration, 0.5) * 1000) / 1000,
      stepRelative: Math.round(percentile(bursts.ratio, 0.5) * 10000) / 10000,
      heapMb: mb(heap),
      memoryMb: mb(memory),
    };
    const panel = this.spawn(Graphics, { zIndex: 9 });
    panel.draw.rect(0, this.height - 100, this.width, 80).fill({ color: 0x080808, alpha: 0.85 });
    this.spawn(Text, {
      x: this.width / 2,
      y: this.height - 60,
      zIndex: 10,
      text: `${result.fps} fps · 1 % low ${result.low1Fps} · frame work ${result.frameWorkMs} ms · game ${result.gameMs} ms · heap ${result.heapMb ?? '?'} MB`,
      style: { fill: 0xffffff, fontSize: 30 },
    });
    window.blacklightBench = result;
    this.game.mount.dataset.bench = JSON.stringify(result);
  }
}
