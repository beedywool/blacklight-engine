// Integration tests of the VS Code extension (TL-03), run inside VS Code by
// scripts/integration.mjs against a copy of e2e/fixtures/tooling. One test per feature of TL-03.
import { copyFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import * as vscode from 'vscode';
import type { AnimationController } from '../../src/editors/animation';
import type { SceneEditorController } from '../../src/editors/scene';
import type { SlicerController } from '../../src/editors/slicer';
import type { TimelineController } from '../../src/editors/timeline';
import type { LiveNode } from '../../src/live';
import type { AssetsController, ConfigController, UiPreviewController } from '../../src/panels';
import {
  api,
  assert,
  closeAll,
  devServer,
  equal,
  fakeGame,
  file,
  read,
  stopDevServer,
  waitFor,
  workspace,
} from './helpers';

const tests: [string, () => Promise<void>][] = [];
const test = (name: string, body: () => Promise<void>) => tests.push([name, body]);

let probe = 0;

/** Completion labels at `|` in a new file (a new name each time: open documents keep their text). */
async function completions(path: string, content: string, marker = '|'): Promise<string[]> {
  path = path.replace(/(\.[a-z]+)?\.ts$/, (ext) => `-${++probe}${ext}`);
  const offset = content.indexOf(marker);
  writeFileSync(file(path), content.replace(marker, ''));
  const document = await vscode.workspace.openTextDocument(file(path));
  const list = await vscode.commands.executeCommand<vscode.CompletionList>(
    'vscode.executeCompletionItemProvider',
    document.uri,
    document.positionAt(offset),
  );
  return list.items.map((item) => (typeof item.label === 'string' ? item.label : item.label.label));
}

test('New Scene and New Object create files from the conventions', async () => {
  const scene = await vscode.commands.executeCommand<string[]>('blacklight.newScene', 'Boss Fight');
  equal(
    scene,
    ['scenes/boss-fight/boss-fight.scene.ts', 'scenes/boss-fight/assets/.gitkeep'],
    'scene files',
  );
  assert(
    read('scenes/boss-fight/boss-fight.scene.ts').includes(
      'export default class BossFight extends Scene',
    ),
    'scene class',
  );
  const object = await vscode.commands.executeCommand<string[]>('blacklight.newObject', {
    name: 'bigEnemy',
    kind: 'animated',
  });
  equal(
    object,
    ['objects/big-enemy/big-enemy.object.ts', 'objects/big-enemy/big-enemy.anim.json'],
    'object files',
  );
  assert(
    read('objects/big-enemy/big-enemy.object.ts').includes(
      "import anims from './big-enemy.anim.json'",
    ),
    'object imports its animations',
  );
  const local = await vscode.commands.executeCommand<string[]>('blacklight.newObject', {
    name: 'shadow',
    kind: 'shape',
    scene: 'boss-fight',
  });
  equal(local, ['scenes/boss-fight/objects/shadow/shadow.object.ts'], 'scene-local object');
  let failed = '';
  await vscode.commands
    .executeCommand('blacklight.newScene', 'boss-fight')
    .then(undefined, (e: Error) => (failed = e.message));
  assert(/already exists/.test(failed), `duplicate scene refused: ${failed}`);
  await closeAll();
});

test('Snippets are contributed for TypeScript', async () => {
  const extension = vscode.extensions.getExtension('blacklight.blacklight-vscode')!;
  const snippets = JSON.parse(
    readFileSync(
      join(extension.extensionPath, 'snippets', 'blacklight.code-snippets'),
      'utf8',
    ).replace(/,(\s*[\]}])/g, '$1'),
  ) as Record<string, { prefix: string }>;
  const prefixes = Object.values(snippets).map((s) => s.prefix);
  for (const prefix of ['bl-scene', 'bl-object', 'bl-spawn', 'bl-pressed'])
    assert(prefixes.includes(prefix), `snippet ${prefix}`);
  // VS Code loads contributed snippets lazily: the first completion may come before them.
  await waitFor(
    async () => (await completions('scenes/arena/probe-snippet.ts', 'bl-sc|')).includes('bl-scene'),
    'bl-scene offered in completion',
  );
});

test('Completion: static props, animation names, input actions, asset paths, scenes', async () => {
  const object = `import { Sprite } from '@blacklight/core';\nexport default class Probe extends Sprite {\n  static |\n}\n`;
  const statics = await completions('objects/hero/probe.object.ts', object);
  for (const name of ['animations', 'behaviors', 'hitbox', 'collision'])
    assert(statics.includes(name), `static ${name} (got ${statics.join(', ')})`);
  const body = (line: string) =>
    `import { Sprite } from '@blacklight/core';\nexport default class Probe extends Sprite {\n  override update() {\n    ${line}\n  }\n}\n`;
  const animations = await completions('objects/hero/probe.object.ts', body("this.play('|');"));
  assert(
    animations.includes('idle') && animations.includes('run'),
    `animation names (got ${animations.join(', ')})`,
  );
  const actions = await completions(
    'objects/hero/probe.object.ts',
    body("this.input.pressed('|');"),
  );
  assert(
    actions.includes('fire') && actions.includes('confirm'),
    `input actions (got ${actions.join(', ')})`,
  );
  const scene = `import { Scene } from '@blacklight/core';\nexport default class Arena2 extends Scene {\n  static override assets = ['|'];\n  create() { this.goto('arena'); }\n}\n`;
  const assets = await completions('scenes/arena/probe.scene.ts', scene);
  assert(
    assets.includes('@assets/arena-bg.png') && assets.includes('@objects/hero/hero@16x16.png'),
    `asset paths (got ${assets.join(', ')})`,
  );
  const scenes = await completions(
    'scenes/arena/probe.scene.ts',
    scene.replace("['|']", "['']").replace("goto('arena')", "goto('|')"),
  );
  assert(scenes.includes('arena'), `scene names (got ${scenes.join(', ')})`);
  await closeAll();
});

test('Animation editor: live preview and edits of the .anim.json', async () => {
  const { controllers } = await api();
  const uri = vscode.Uri.file(file('objects/hero/hero.anim.json'));
  await vscode.commands.executeCommand('blacklight.openAnimationEditor', uri);
  const editor = await waitFor(
    () => controllers.latest<AnimationController>('animation'),
    'animation editor',
  );
  let state = editor.state();
  equal(
    state.preview.animations.map((a) => [a.name, a.frames.length, a.durations[0]]),
    [
      ['idle', 2, 500],
      ['run', 2, 125],
    ],
    'resolved animations',
  );
  equal(
    state.preview.animations[1]!.frames[0],
    { x: 32, y: 0, width: 16, height: 16 },
    'grid frame of run',
  );
  assert(
    state.imageUrl?.includes('hero%4016x16.png') || state.imageUrl?.includes('hero@16x16.png'),
    `sheet URL ${state.imageUrl}`,
  );
  await editor.receive({ type: 'set', animation: 'run', key: 'fps', value: 12 });
  assert(
    editor.document.getText().includes('"run": { "frames": [2, 3], "fps": 12'),
    `fps written: ${editor.document.getText()}`,
  );
  // Edited as text: the preview follows.
  const edit = new vscode.WorkspaceEdit();
  edit.replace(
    uri,
    new vscode.Range(0, 0, editor.document.lineCount, 0),
    editor.document.getText().replace('"frames": [0, 1]', '"frames": [0, 1, 2]'),
  );
  await vscode.workspace.applyEdit(edit);
  state = editor.state();
  equal(state.preview.animations[0]!.frames.length, 3, 'preview follows text edits');
  await editor.receive({ type: 'add', name: 'jump' });
  await editor.receive({ type: 'rename', from: 'jump', to: 'leap' });
  assert(
    Object.keys(
      (JSON.parse(editor.document.getText()) as { animations: object }).animations,
    ).includes('leap'),
    'add + rename',
  );
  await editor.receive({ type: 'remove', name: 'leap' });
  await editor.document.save();
  await closeAll();
});

test('JSON Schemas validate .anim.json, .layout.json and .timeline.json', async () => {
  writeFileSync(
    file('objects/hero/broken.anim.json'),
    JSON.stringify({ animations: { run: { fps: -1 } }, nope: 1 }, null, 2),
  );
  writeFileSync(
    file('scenes/arena/broken.layout.json'),
    JSON.stringify({ objects: [{ type: 'Coin' }] }, null, 2),
  );
  for (const path of ['objects/hero/broken.anim.json', 'scenes/arena/broken.layout.json']) {
    const document = await vscode.workspace.openTextDocument(file(path));
    await vscode.window.showTextDocument(document);
    const diagnostics = await waitFor(
      () => {
        const list = vscode.languages.getDiagnostics(document.uri);
        return list.length > 0 ? list : undefined;
      },
      `schema diagnostics of ${path}`,
      30_000,
    );
    assert(diagnostics.length >= 1, `${path} has schema errors`);
  }
  await closeAll();
});

test('Sprite-sheet slicer: grid, frames, animations, save', async () => {
  const { controllers } = await api();
  mkdirSync(file('objects/slime'), { recursive: true });
  copyFileSync(file('objects/hero/hero@16x16.png'), file('objects/slime/slime.png'));
  writeFileSync(
    file('objects/slime/slime.object.ts'),
    "import { Sprite } from '@blacklight/core';\nexport default class Slime extends Sprite {}\n",
  );
  await vscode.commands.executeCommand(
    'blacklight.sliceSheet',
    vscode.Uri.file(file('objects/slime/slime.png')),
  );
  const slicer = await waitFor(() => controllers.latest<SlicerController>('slicer'), 'slicer');
  let state = slicer.state();
  equal(
    [state.width, state.height, state.slice.frames.length, state.gridName],
    [64, 16, 4, 'slime@16x16.png'],
    'guessed grid',
  );
  await slicer.receive({ type: 'grid', width: 32, height: 16, spacing: 0 });
  equal(slicer.state().slice.frames.length, 2, 'regrid');
  await slicer.receive({ type: 'grid', width: 16, height: 16, spacing: 0 });
  const result = (await slicer.receive({
    type: 'save',
    animations: { idle: [0, 1], walk: [0, 1, 2, 3] },
    fps: 8,
    rename: true,
    overwrite: true,
  })) as { image: string; animFile: string };
  equal(result, { image: 'slime@16x16.png', animFile: 'slime.anim.json' }, 'save result');
  assert(
    existsSync(file('objects/slime/slime@16x16.png')) &&
      !existsSync(file('objects/slime/slime.png')),
    'image renamed after its grid',
  );
  const anim = JSON.parse(read('objects/slime/slime.anim.json')) as {
    source: string;
    animations: Record<string, { frames: unknown }>;
  };
  equal(anim.source, './slime@16x16.png', 'anim source');
  equal(anim.animations.walk!.frames, { from: 0, to: 3 }, 'range of consecutive frames');
  state = slicer.state();
  equal(state.animFile, 'objects/slime/slime.anim.json', 'slicer sees the anim file');
  await closeAll();
});

test('Visual scene editor: palette, placement saved as JSON, load() added to the scene', async () => {
  const { controllers } = await api();
  await vscode.commands.executeCommand('blacklight.openSceneEditor', 'arena');
  const editor = await waitFor(
    () => controllers.latest<SceneEditorController>('scene'),
    'scene editor',
  );
  const state = editor.state();
  equal(state.layout?.objects.length, 3, 'layout objects');
  equal(state.resolution, { width: 320, height: 180 }, 'resolution from game.config.ts');
  const hero = state.palette.find((p) => p.name === 'Hero');
  equal(
    hero?.frame,
    { x: 0, y: 0, width: 16, height: 16 },
    'hero thumbnail is its first idle frame',
  );
  assert(
    state.palette.some((p) => p.name === 'Coin' && p.imageUrl),
    'coin thumbnail',
  );
  await editor.receive({
    type: 'edit',
    edit: { op: 'add', placement: { type: 'Coin', x: 250.4, y: 40 } },
  });
  await editor.receive({ type: 'edit', edit: { op: 'move', index: 0, x: 80, y: 120 } });
  await editor.receive({
    type: 'edit',
    edit: { op: 'update', index: 3, patch: { tags: ['bonus'], props: { value: 5 } } },
  });
  await editor.receive({ type: 'save' });
  const saved = read('scenes/arena/arena.layout.json');
  assert(saved.includes('{ "type": "Hero", "x": 80, "y": 120 }'), `move written: ${saved}`);
  assert(
    saved.includes(
      '{ "type": "Coin", "x": 250.4, "y": 40, "tags": ["bonus"], "props": { "value": 5 } }',
    ),
    `add written: ${saved}`,
  );
  await editor.receive({ type: 'edit', edit: { op: 'remove', index: 3 } });
  await editor.receive({ type: 'save' });
  // A scene without a layout gets one, and its create() loads it.
  await vscode.commands.executeCommand('blacklight.openSceneEditor', 'boss-fight');
  await waitFor(
    () => existsSync(file('scenes/boss-fight/boss-fight.layout.json')),
    'new layout file',
  );
  const source = read('scenes/boss-fight/boss-fight.scene.ts');
  assert(
    source.includes("import layout from './boss-fight.layout.json';") &&
      source.includes('this.load(layout);'),
    `scene loads its layout: ${source}`,
  );
  await closeAll();
});

test('Game configuration form edits game.config.ts in place', async () => {
  const { controllers } = await api();
  await vscode.commands.executeCommand('blacklight.openConfig');
  const form = await waitFor(() => controllers.latest<ConfigController>('config'), 'config form');
  let state = form.state();
  equal(
    [state.values.name, state.values['resolution.width'], state.values['resolution.pixelArt']],
    ['Tooling fixture', 320, true],
    'read values',
  );
  equal(state.values['input.actions'], { fire: ['KeyF', 'Pad:RT'] }, 'read actions');
  assert(state.scenes.includes('arena'), 'scenes for the entry field');
  await form.receive({ type: 'set', path: 'name', value: 'Renamed' });
  await form.receive({ type: 'set', path: 'resolution.width', value: 640 });
  await form.receive({ type: 'set', path: 'tickRate', value: 30 });
  await form.receive({ type: 'set', path: 'ui.theme', value: 'persona' });
  await form.receive({
    type: 'set',
    path: 'input.actions',
    value: { fire: ['KeyF'], dash: ['ShiftLeft', 'Pad:B'] },
  });
  await form.receive({ type: 'set', path: 'seed', value: undefined });
  const text = read('game.config.ts');
  for (const part of [
    "name: 'Renamed',",
    'width: 640, height: 180',
    'tickRate: 30,',
    "ui: { theme: 'persona' },",
    "dash: ['ShiftLeft', 'Pad:B'],",
    '// Tooling fixture',
  ])
    assert(text.includes(part), `config contains ${part}:\n${text}`);
  assert(!text.includes('seed:'), 'seed removed');
  state = form.state();
  equal(state.values.tickRate, 30, 'form reads back');
  let refused = '';
  await form
    .receive({ type: 'set', path: 'name', value: undefined })
    .catch((e: Error) => (refused = e.message));
  assert(/required/.test(refused), 'required field cannot be removed');
  await closeAll();
});

test('Asset browser: thumbnails, unused assets, weight per scene', async () => {
  const { controllers } = await api();
  await vscode.commands.executeCommand('blacklight.openAssets');
  const browser = await waitFor(
    () => controllers.latest<AssetsController>('assets'),
    'asset browser',
  );
  const state = browser.state();
  const entry = (path: string) => state.assets.find((a) => a.path === path);
  assert(entry('assets/unused.png') && !entry('assets/unused.png')!.used, 'unused.png is unused');
  assert(entry('assets/arena-bg.png')?.used, 'arena-bg.png is used (static assets)');
  assert(entry('objects/hero/hero@16x16.png')?.used, 'hero sheet is used');
  assert(state.thumbnails['assets/unused.png'], 'image thumbnail');
  const arena = state.scenes.find((s) => s.scene === 'arena')!;
  const paths = arena.files.map((f) => f.path);
  assert(
    paths.includes('assets/arena-bg.png') &&
      paths.includes('objects/hero/hero@16x16.png') &&
      !paths.includes('assets/unused.png'),
    `arena preloads ${paths.join(', ')}`,
  );
  equal(
    arena.bytes,
    arena.files.reduce((sum, f) => sum + f.bytes, 0),
    'scene weight is the sum of its files',
  );
  await closeAll();
});

test('UI timeline editor: rows, edits, play in the running game', async () => {
  const { controllers } = await api();
  const created = await vscode.commands.executeCommand<string[]>(
    'blacklight.newTimeline',
    'pause-intro',
  );
  equal(created, ['animations/pause-intro.timeline.json'], 'new timeline');
  await vscode.commands.executeCommand(
    'vscode.openWith',
    vscode.Uri.file(file('animations/menu-intro.timeline.json')),
    'blacklight.timelineEditor',
  );
  const editor = await waitFor(() => {
    const latest = controllers.latest<TimelineController>('timeline');
    return latest?.document.uri.fsPath.endsWith('menu-intro.timeline.json') ? latest : undefined;
  }, 'timeline editor');
  let state = editor.state();
  equal(
    state.rows.map((r) => [r.kind, r.start, r.duration]),
    [
      ['to', 0, 0.2],
      ['label', 0.2, 0],
      ['to', 0.2, 0.15],
      ['sound', 0.2, 0],
    ],
    'rows',
  );
  await editor.receive({
    type: 'edit',
    edit: {
      op: 'update',
      index: 0,
      step: { to: '.menu__title', keyframes: { opacity: [0, 1] }, duration: 0.5 },
    },
  });
  await editor.receive({
    type: 'edit',
    edit: { op: 'add', step: { sound: 'whoosh', at: 'buttons+0.1' } },
  });
  state = editor.state();
  equal(
    state.rows.map((r) => r.start),
    [0, 0.5, 0.5, 0.5, 0.6],
    'times follow the edit',
  );
  assert(
    editor.document.getText().includes('{ "sound": "whoosh", "at": "buttons+0.1" }'),
    'step written',
  );
  const game = await fakeGame('game-timeline', { 'ui.timeline': () => 'ok' });
  await editor.receive({ type: 'play' });
  equal(
    game.calls[0]?.params.timeline &&
      (game.calls[0].params.timeline as { steps: unknown[] }).steps.length,
    5,
    'the game received the timeline',
  );
  game.close();
  await editor.document.save();
  await closeAll();
});

test('Live UI component preview with simulated focus states', async () => {
  const { controllers } = await api();
  const info = await devServer();
  await vscode.commands.executeCommand(
    'blacklight.previewUi',
    vscode.Uri.file(file('ui/Menu.vue')),
  );
  const preview = await waitFor(
    () => controllers.latest<UiPreviewController>('ui-preview'),
    'UI preview',
  );
  const state = preview.state();
  assert(
    state.url?.includes(`:${info.port}`) &&
      state.url.includes(`blacklight-client=${preview.clientId}`),
    `frame URL ${state.url}`,
  );
  let focused = 0;
  const labels = ['Resume', 'Options', 'Quit'];
  const game = await fakeGame(preview.clientId, {
    'ui.open': ({ screen }) => ({ screen }),
    'ui.focusables': () =>
      labels.map((label, index) => ({ index, label, focused: index === focused })),
    'ui.focus': ({ index }) => ((focused = Number(index)), { index }),
  });
  await waitFor(() => preview.state().ready, 'the screen to open in the frame game');
  equal(game.calls[0], { method: 'ui.open', params: { screen: 'Menu' } }, 'screen opened by name');
  equal(
    preview.state().focusables.map((f) => f.label),
    labels,
    'focus states listed',
  );
  await preview.receive({ type: 'focus', index: 2 });
  equal(
    preview.state().focusables.map((f) => f.focused),
    [false, false, true],
    'Quit focused',
  );
  game.close();
  await closeAll();
});

test('Debugging: launch configuration, live objects and variables, pause and step', async () => {
  const { launch, objects } = await api();
  const info = await devServer();
  const folder = vscode.workspace.workspaceFolders![0]!;
  const resolved = (await launch.resolveDebugConfigurationWithSubstitutedVariables(folder, {
    type: 'blacklight',
    request: 'launch',
    name: 'Debug game',
  })) as vscode.DebugConfiguration;
  equal(
    [resolved.type, resolved.url, resolved.webRoot],
    ['chrome', info.url, join(workspace, '.blacklight')],
    'browser debug session at the dev server',
  );
  equal(resolved.pathMapping, { '/@fs/': '/' }, 'files outside the Vite root map to disk');
  const hero = { id: 1, type: 'Hero', scene: 'arena', x: 60, y: 100, tags: [] };
  let hp = 3;
  const game = await fakeGame('game-debug', {
    objects: () => ({
      scene: 'arena',
      objects: [hero, { id: 2, type: 'Coin', scene: 'arena', x: 140, y: 100, tags: ['first'] }],
    }),
    inspect: () => ({
      core: { x: 60, y: 100, vx: 0 },
      data: { hp },
      state: {},
      behaviors: [{ enabled: true, data: { speed: 90 } }],
      animation: { name: 'idle' },
    }),
    set: ({ path, value }) => (path === 'hp' && (hp = Number(value)), {}),
    pause: () => ({ paused: true }),
    step: () => ({ step: 1 }),
  });
  const roots = await objects.getChildren();
  equal(
    roots.map((n) => (n.kind === 'scene' ? `${n.name}:${n.objects.length}` : n.kind)),
    ['arena:2'],
    'scenes',
  );
  const list = await objects.getChildren(roots[0]);
  equal(
    list.map((n) => objects.getTreeItem(n).label),
    ['Hero #1', 'Coin #2'],
    'objects',
  );
  const variables = (await objects.getChildren(list[0])) as Extract<
    LiveNode,
    { kind: 'variable' }
  >[];
  equal(
    variables.map((v) => v.path),
    [
      'hp',
      'core.x',
      'core.y',
      'core.vx',
      'behaviors.0.enabled',
      'behaviors.0.speed',
      'animation.name',
    ],
    'variables',
  );
  await vscode.commands.executeCommand('blacklight.editVariable', variables[0], 9);
  equal(hp, 9, 'variable edited in the game');
  await vscode.commands.executeCommand('blacklight.pauseGame');
  await vscode.commands.executeCommand('blacklight.stepGame');
  equal(
    game.calls.filter((c) => ['pause', 'step', 'set'].includes(c.method)).map((c) => c.method),
    ['set', 'pause', 'step'],
    'commands reach the game',
  );
  const debuggers = (
    vscode.extensions.getExtension('blacklight.blacklight-vscode')!.packageJSON as {
      contributes: { debuggers: { type: string }[] };
    }
  ).contributes.debuggers;
  equal(debuggers[0]?.type, 'blacklight', 'debugger contributed');
  game.close();
});

/** Entry point called by @vscode/test-electron. */
export async function run(): Promise<void> {
  const failures: string[] = [];
  await api();
  try {
    for (const [name, body] of tests) {
      const start = Date.now();
      try {
        await body();
        console.log(`  ok    ${name} (${Date.now() - start} ms)`);
      } catch (error) {
        failures.push(name);
        console.log(
          `  FAIL  ${name}\n        ${error instanceof Error ? (error.stack ?? error.message) : String(error)}`,
        );
      }
    }
  } finally {
    stopDevServer();
  }
  console.log(`\n${tests.length - failures.length}/${tests.length} passed`);
  if (failures.length) throw new Error(`${failures.length} failed: ${failures.join('; ')}`);
}
