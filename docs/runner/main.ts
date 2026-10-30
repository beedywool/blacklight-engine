// The runner: one game per page load. A docs page (live example or playground) sends the files,
// the runner compiles them, starts the real engine and reports errors and the first frames back.
// The page reloads the iframe for every run, so nothing leaks from one run to the next.
import 'pixi.js/unsafe-eval';
import '@blacklight/ui/style.css';
import * as core from '@blacklight/core';
import * as uiPackage from '@blacklight/ui';
import * as pixi from 'pixi.js';
import * as vue from 'vue';
import { ModuleGraph, type PackageLoaders } from './compile';
import type { ProjectFiles, RenderReport, RunMessage, RunnerMessage } from './protocol';

const PACKAGES: PackageLoaders = {
  '@blacklight/core': async () => core,
  '@blacklight/ui': async () => uiPackage,
  'pixi.js': async () => pixi,
  vue: async () => vue,
};

const EXAMPLE_CONFIG: core.GameConfig = {
  name: 'Example',
  id: 'dev.blacklight.example',
  version: '1.0.0',
  entry: 'main',
  resolution: { width: 1280, height: 720, mode: 'letterbox' },
  pauseOnBlur: false,
};

const mount = document.getElementById('game')!;
let graph: ModuleGraph | undefined;
let failed = false;

function post(message: RunnerMessage): void {
  parent.postMessage(message, location.origin);
}

function text(error: unknown): string {
  const raw = error instanceof Error ? error.message : String(error);
  return graph ? graph.readable(raw) : raw;
}

function fail(error: unknown): void {
  failed = true;
  const message = text(error);
  post({ type: 'blacklight:error', message });
  const box = document.createElement('pre');
  box.className = 'runner-error';
  box.textContent = message;
  document.body.append(box);
}

addEventListener('error', (event) => fail(event.error ?? event.message));
addEventListener('unhandledrejection', (event) => fail(event.reason));
const consoleError = console.error.bind(console);
console.error = (...args: unknown[]) => {
  consoleError(...args);
  fail(args.map((arg) => (arg instanceof Error ? arg.message : String(arg))).join(' '));
};

/** Places an example's files in a project: `main.ts` becomes the `main` scene. */
function exampleProject(files: ProjectFiles): ProjectFiles {
  const project: ProjectFiles = {};
  for (const [path, content] of Object.entries(files)) {
    if (path.startsWith('assets/')) project[path] = content;
    else if (path === 'main.ts') project['scenes/main/main.scene.ts'] = content;
    else project[`scenes/main/${path}`] = content;
  }
  return project;
}

function isCode(path: string): boolean {
  return /\.[cm]?[jt]s$/.test(path);
}

async function run({ mode, files }: RunMessage): Promise<void> {
  const project = mode === 'example' ? exampleProject(files) : files;
  graph = new ModuleGraph(project, PACKAGES);
  const scenes: Record<string, () => Promise<unknown>> = {};
  const objects: Record<string, () => Promise<unknown>> = {};
  const screens: Record<string, () => Promise<unknown>> = {};
  const assets: core.AssetManifest = { files: {} };
  for (const path of Object.keys(project)) {
    if (/^scenes\/[^/]+\/[^/]+\.scene\.ts$/.test(path)) scenes[path] = graph.loader(path);
    else if (/(^|\/)objects\/[^/]+\/[^/]+\.object\.ts$/.test(path))
      objects[path] = graph.loader(path);
    else if (/(^ui|^scenes\/[^/]+\/ui)\/.+\.ts$/.test(path))
      // The UI layer names screens after their .vue file; here they are .ts render functions.
      screens[path.replace(/\.ts$/, '.vue')] = graph.loader(path);
    if (!isCode(path) && path !== 'game.config.ts') assets.files[path] = graph.assetUrl(path);
  }

  let config: core.GameConfig;
  const sceneLoaders = core.scenesFromGlob(scenes);
  if (mode === 'example') {
    const main = await graph.import('scenes/main/main.scene.ts');
    const extra = (main.config ?? {}) as Partial<core.GameConfig>;
    config = {
      ...EXAMPLE_CONFIG,
      ...extra,
      resolution: { ...EXAMPLE_CONFIG.resolution, ...extra.resolution },
    };
    for (const [name, type] of Object.entries((main.scenes ?? {}) as Record<string, unknown>))
      sceneLoaders[name] = async () => ({ default: type }) as never;
  } else {
    if (project['game.config.ts'] === undefined)
      throw new Error('The project has no game.config.ts.');
    config = (await graph.import('game.config.ts')).default as core.GameConfig;
  }

  const game = await core.createGame(config, {
    scenes: sceneLoaders,
    objects: core.objectsFromGlob(objects),
    assets,
    mount,
    plugins: [uiPackage.ui({ screens })],
  });
  Object.assign(window, { blacklight: game });
  await report(game);
}

/** Waits for the first scene and a few frames, then measures what was drawn. */
async function report(game: core.Game): Promise<void> {
  const deadline = performance.now() + 15_000;
  while (mount.dataset.blacklightState !== 'running') {
    if (failed) return;
    if (performance.now() > deadline) throw new Error('The first scene did not start in 15 s.');
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
  // Frames are throttled while the preview is off screen: never wait more than 100 ms for one.
  for (let i = 0; i < 20; i++)
    await new Promise((resolve) => {
      requestAnimationFrame(resolve);
      setTimeout(resolve, 100);
    });
  if (failed) return;
  let lit = 0;
  try {
    const canvas = game.app.renderer.extract.canvas(game.app.stage) as HTMLCanvasElement;
    const context = document.createElement('canvas').getContext('2d')!;
    context.canvas.width = canvas.width;
    context.canvas.height = canvas.height;
    context.drawImage(canvas, 0, 0);
    const pixels = context.getImageData(0, 0, canvas.width, canvas.height).data;
    for (let i = 3; i < pixels.length; i += 4) if (pixels[i]! > 0) lit++;
  } catch {
    lit = 0;
  }
  const result: RenderReport = {
    width: game.app.canvas.width,
    height: game.app.canvas.height,
    lit,
    uiElements: mount.querySelectorAll('.bl-screen *').length,
    scene: mount.dataset.blacklightScene ?? '',
  };
  document.body.dataset.runnerState = 'running';
  post({ type: 'blacklight:running', report: result });
}

addEventListener('message', (event: MessageEvent<RunMessage>) => {
  if (event.origin !== location.origin || event.data?.type !== 'blacklight:run') return;
  run(event.data).catch(fail);
});

post({ type: 'blacklight:ready' });
