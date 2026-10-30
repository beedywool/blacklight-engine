import { Graphics, Scene, Text } from '@blacklight/core';
import { UPDATE_PRIORITY } from 'pixi.js';

/** Frames ignored at the start: shader compilation, texture uploads, JIT warm-up. */
export const WARMUP_MS = 2000;
/** Length of the measured window. */
export const MEASURE_MS = 5000;

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
  frameWorkP99Ms: number;
  /** Game's own ticker work per frame: fixed steps, objects, animations, Pixi's draw calls. */
  gameMs: number;
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

    const slowest = [...intervals]
      .sort((a, b) => b - a)
      .slice(0, Math.max(1, Math.ceil(intervals.length / 100)));
    window.gc?.();
    const heap = performance.memory?.usedJSHeapSize;
    let memory: number | undefined;
    if (crossOriginIsolated && performance.measureUserAgentSpecificMemory)
      memory = (await performance.measureUserAgentSpecificMemory()).bytes;
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
      frameWorkP99Ms: round(percentile(work, 0.99)),
      gameMs: round(mean(game)),
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
