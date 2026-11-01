import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import * as ts from 'typescript';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { animPreview, editAnimations, setAnimField } from '../../src/core/anim';
import { assetReport, formatBytes, resolveRef, staticAssets } from '../../src/core/assets';
import {
  assetRef,
  completionContext,
  fileKind,
  suggestions,
  type CompletionData,
} from '../../src/core/completion';
import { readConfig, setConfigValue } from '../../src/core/config';
import { DebugClient, socketUrl, type SocketLike } from '../../src/core/debug-client';
import { formatJson } from '../../src/core/json';
import { resolveLaunch } from '../../src/core/launch';
import { comparablePath } from '../integration/paths';
import {
  applyLayoutEdit,
  configResolution,
  parseLayout,
  printLayout,
  sceneStatics,
} from '../../src/core/layout';
import {
  findGameRoot,
  listAssets,
  listObjects,
  listScenes,
  objectsForScene,
  readActions,
  topLevelKeys,
} from '../../src/core/project';
import { addLayoutLoad } from '../../src/core/scene-code';
import { animFileFor, gridFileName, guessGrid, pngSize, slice } from '../../src/core/sheet';
import { objectFiles, sceneFiles, toFolderName, validateName } from '../../src/core/templates';
import {
  applyTimelineEdit,
  parseTimeline,
  printTimeline,
  timelineRows,
} from '../../src/core/timeline';

const fixture = resolve(import.meta.dirname, '../../../../e2e/fixtures/tooling');
const heroPng = readFileSync(join(fixture, 'objects/hero/hero@16x16.png'));

let root: string;
beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), 'blacklight-vscode-'));
});
afterEach(() => rmSync(root, { recursive: true, force: true }));

function files(map: Record<string, string | Buffer>): void {
  for (const [path, content] of Object.entries(map)) {
    mkdirSync(join(root, path, '..'), { recursive: true });
    writeFileSync(join(root, path), content);
  }
}

describe('project', () => {
  it('finds scenes, objects, assets and actions like the CLI', () => {
    files({
      'game.config.ts':
        "export default defineConfig({ input: { actions: { fire: ['KeyF', 'Pad:RT'], 'dash-left': ['KeyQ'] } } });",
      'scenes/level/level.scene.ts': '',
      'scenes/level/objects/ghost/ghost.object.ts': '',
      'scenes/level/level.layout.json': '{}',
      'objects/big-hero/big-hero.object.ts': '',
      'objects/big-hero/big-hero.anim.json': '{"animations":{}}',
      'objects/big-hero/big-hero@32x32.png': heroPng,
      'objects/ghost/ghost.object.ts': '',
      'assets/music.ogg': 'x',
    });
    expect(findGameRoot(join(root, 'scenes/level'))).toBe(root);
    expect(listScenes(root)).toEqual(['level']);
    expect(listObjects(root).map((o) => [o.name, o.folder, o.scene, o.anim, o.image])).toEqual([
      [
        'BigHero',
        'objects/big-hero',
        undefined,
        'objects/big-hero/big-hero.anim.json',
        'objects/big-hero/big-hero@32x32.png',
      ],
      ['Ghost', 'objects/ghost', undefined, undefined, undefined],
      ['Ghost', 'scenes/level/objects/ghost', 'level', undefined, undefined],
    ]);
    expect(objectsForScene(root, 'level').map((o) => o.folder)).toEqual([
      'scenes/level/objects/ghost',
      'objects/big-hero',
    ]);
    expect(listAssets(root)).toEqual(['assets/music.ogg', 'objects/big-hero/big-hero@32x32.png']);
    expect(readActions(root)).toEqual(
      expect.arrayContaining(['fire', 'dash-left', 'confirm', 'left']),
    );
    files({ '.blacklight/types.d.ts': 'interface Register {\n  actions: "a" | "b";\n}' });
    expect(readActions(root)).toEqual(['a', 'b']);
  });

  it('reads top-level keys of an object literal', () => {
    const text = "{ fire: ['Pad:RT'], jump: ['Space'], nested: { no: 1 }, 'quoted-key': [] }";
    expect(topLevelKeys(text, 1)).toEqual(['fire', 'jump', 'nested', 'quoted-key']);
  });
});

describe('templates', () => {
  it('names folders and validates', () => {
    expect(toFolderName('Big Enemy')).toBe('big-enemy');
    expect(toFolderName('bigEnemy')).toBe('big-enemy');
    expect(validateName('', [])).toMatch(/Type a name/);
    expect(validateName('2d', [])).toMatch(/start with a letter/);
    expect(validateName('hero', ['hero'])).toMatch(/already exists/);
    expect(validateName('hero', [])).toBeUndefined();
  });
  it('writes scene and object files', () => {
    expect(Object.keys(sceneFiles('battle'))).toEqual([
      'scenes/battle/battle.scene.ts',
      'scenes/battle/assets/.gitkeep',
    ]);
    const object = objectFiles('slime', 'animated', 'scenes/cave/objects');
    const anim = JSON.parse(object['scenes/cave/objects/slime/slime.anim.json']!) as {
      $schema: string;
    };
    expect(anim.$schema).toBe('../../../../node_modules/@blacklight/core/schema/anim.schema.json');
    expect(object['scenes/cave/objects/slime/slime.object.ts']).toContain(
      'export default class Slime extends Sprite',
    );
  });
});

describe('completion', () => {
  const data: CompletionData = {
    animations: ['idle'],
    actions: ['fire'],
    scenes: ['level'],
    objects: ['Coin'],
    screens: ['Hud'],
    assetRefs: ['./assets/a.png'],
    sounds: ['coin'],
  };
  it('detects what the cursor types', () => {
    const kind = (before: string, file = 'objects/x/x.object.ts') =>
      completionContext(before, fileKind(file))?.kind;
    expect(kind("this.play('")).toBe('animation');
    expect(kind("this.input.pressed('ju")).toBe('action');
    expect(kind('this.input.player(2).held("')).toBe('action');
    expect(kind("this.scene.audio.play('")).toBe('sound');
    expect(kind("this.goto('")).toBe('scene');
    expect(kind("this.spawn('")).toBe('object');
    expect(kind("this.ui.push('")).toBe('screen');
    expect(kind("static override assets = [\n    './a.png',\n    '")).toBe('asset');
    expect(kind('class A extends Sprite {\n  static ')).toBe('static');
    expect(kind('class A extends Sprite {\n  hit')).toBe('static');
    expect(kind('class A extends Sprite {\n  update() {\n    hit')).toBeUndefined();
    expect(kind('const x = 1;', 'src/util.ts')).toBeUndefined();
  });
  it('offers the project names', () => {
    expect(suggestions({ kind: 'animation' }, 'object', data).map((s) => s.label)).toEqual([
      'idle',
    ]);
    const statics = suggestions({ kind: 'static', typedStatic: false }, 'scene', data);
    expect(statics.map((s) => s.label)).toEqual(['static assets', 'static layers', 'static size']);
    expect(statics[0]!.snippet).toMatch(/^static override assets = /);
    expect(suggestions({ kind: 'static', typedStatic: true }, 'object', data)[0]!.snippet).toMatch(
      /^animations = /,
    );
  });
  it('writes asset references the way the runtime resolves them', () => {
    expect(assetRef('scenes/level/assets/a.png', 'scenes/level')).toBe('./assets/a.png');
    expect(assetRef('assets/music/a.ogg', 'scenes/level')).toBe('@assets/music/a.ogg');
    expect(assetRef('objects/coin/coin.png', 'scenes/level')).toBe('@objects/coin/coin.png');
    expect(assetRef('scenes/other/assets/b.png', 'scenes/level')).toBe(
      '/scenes/other/assets/b.png',
    );
  });
});

describe('sprite sheets', () => {
  it('reads PNG sizes and cuts grids like the runtime', () => {
    expect(pngSize(heroPng)).toEqual({ width: 64, height: 16 });
    expect(pngSize(Buffer.from('nope'))).toBeUndefined();
    const s = slice({ width: 16, height: 16, spacing: 0 }, 64, 16);
    expect([s.columns, s.rows, s.frames.length]).toEqual([4, 1, 4]);
    expect(slice({ width: 10, height: 10, spacing: 2 }, 34, 26).frames).toHaveLength(4);
    expect(gridFileName('hero.png', { width: 16, height: 16, spacing: 0 })).toBe('hero@16x16.png');
    expect(gridFileName('hero@8x8.png', { width: 16, height: 24, spacing: 2 })).toBe(
      'hero@16x24+2.png',
    );
    expect(guessGrid('hero.png', 64, 16)).toEqual({ width: 16, height: 16, spacing: 0 });
    expect(guessGrid('hero@32x8.png', 64, 16)).toEqual({ width: 32, height: 8, spacing: 0 });
  });
  it('writes the .anim.json of a slice', () => {
    const json = JSON.parse(
      animFileFor(
        'slime@16x16.png',
        { idle: [0, 1], walk: [2, 3, 4, 5], hit: [5, 2, 7] },
        8,
        's.json',
      ),
    ) as Record<string, unknown>;
    expect(json).toEqual({
      $schema: 's.json',
      source: './slime@16x16.png',
      fps: 8,
      default: 'idle',
      animations: {
        idle: { frames: [0, 1] },
        walk: { frames: { from: 2, to: 5 } },
        hit: { frames: [5, 2, 7] },
      },
    });
  });
});

describe('formatJson', () => {
  it('keeps short values on one line', () => {
    expect(formatJson({ a: [1, 2], b: { c: 'd' } })).toBe(
      '{\n  "a": [1, 2],\n  "b": { "c": "d" }\n}\n',
    );
    const long = formatJson({ list: Array.from({ length: 40 }, (_, i) => i) });
    expect(long.split('\n').length).toBeGreaterThan(10);
  });
});

describe('animation preview', () => {
  const io = (extra: Record<string, unknown> = {}) => ({
    folder: 'hero',
    files: ['hero@16x16.png', 'hero.anim.json', 'hero.aseprite.json'],
    imageSize: (file: string) => (file.endsWith('.png') ? { width: 64, height: 16 } : undefined),
    readJson: () => ({
      frames: [
        { frame: { x: 0, y: 0, w: 8, h: 8 }, duration: 50 },
        { frame: { x: 8, y: 0, w: 8, h: 8 }, duration: 70 },
      ],
      meta: {
        image: 'hero-sheet.png',
        frameTags: [{ name: 'blink', from: 0, to: 1, direction: 'forward' }],
      },
    }),
    ...extra,
  });
  it('resolves grid sheets, Aseprite tags and errors', () => {
    const grid = animPreview(
      JSON.stringify({
        source: './hero@16x16.png',
        animations: { run: { frames: { from: 1, to: 3 }, fps: 10 } },
      }),
      io(),
    );
    expect(grid.animations[0]).toMatchObject({
      name: 'run',
      durations: [100, 100, 100],
      loop: true,
    });
    expect(grid.animations[0]!.frames[2]).toEqual({ x: 48, y: 0, width: 16, height: 16 });
    const aseprite = animPreview(
      JSON.stringify({ source: './hero.aseprite.json', animations: { blink: {} } }),
      io(),
    );
    expect([aseprite.image, aseprite.animations[0]!.durations]).toEqual([
      'hero-sheet.png',
      [50, 70],
    ]);
    expect(animPreview('{', io()).error).toMatch(/Invalid JSON/);
    expect(
      animPreview(JSON.stringify({ source: './missing.png', animations: {} }), io()).error,
    ).toMatch(/not in this folder/);
  });
  it('edits fields and animations', () => {
    const text = JSON.stringify({ default: 'idle', animations: { idle: { frames: [0] } } });
    expect(JSON.parse(setAnimField(text, 'idle', 'fps', 6))).toMatchObject({
      animations: { idle: { fps: 6 } },
    });
    expect(JSON.parse(setAnimField(text, undefined, 'fps', 12))).toMatchObject({ fps: 12 });
    const renamed = JSON.parse(editAnimations(text, { rename: { from: 'idle', to: 'rest' } })) as {
      default: string;
      animations: object;
    };
    expect([renamed.default, Object.keys(renamed.animations)]).toEqual(['rest', ['rest']]);
    expect(JSON.parse(editAnimations(text, { add: 'run' })).animations.run).toEqual({
      frames: [0],
    });
    expect(JSON.parse(editAnimations(text, { remove: 'idle' }))).toEqual({ animations: {} });
  });
});

describe('layouts', () => {
  it('applies editor edits and prints one object per line', () => {
    let layout = parseLayout('');
    layout = applyLayoutEdit(layout, {
      op: 'add',
      placement: { type: 'Coin', x: 1.234, y: 2, scale: 1, tags: [] },
    });
    layout = applyLayoutEdit(layout, { op: 'duplicate', index: 0 });
    layout = applyLayoutEdit(layout, {
      op: 'update',
      index: 1,
      patch: { layer: 'back', angle: 45 },
    });
    layout = applyLayoutEdit(layout, { op: 'order', index: 1, to: 0 });
    layout = applyLayoutEdit(layout, { op: 'move', index: 1, x: 5, y: 6 });
    expect(printLayout({ $schema: 'x', ...layout })).toBe(
      '{\n  "$schema": "x",\n  "objects": [\n    { "type": "Coin", "x": 17.23, "y": 18, "layer": "back", "angle": 45 },\n    { "type": "Coin", "x": 5, "y": 6 }\n  ]\n}\n',
    );
    expect(() => applyLayoutEdit(layout, { op: 'remove', index: 9 })).toThrow(/No object 9/);
    expect(() => parseLayout('{}')).toThrow(/"objects"/);
  });
  it('reads scene statics and the resolution', () => {
    expect(
      sceneStatics(
        "static override layers = ['back', 'main'];\nstatic size = { width: 3840, height: 2160 };",
      ),
    ).toEqual({
      layers: ['back', 'main'],
      size: { width: 3840, height: 2160 },
    });
    expect(sceneStatics('')).toEqual({ layers: ['main'] });
    expect(configResolution("resolution: { width: 320, height: 180, mode: 'letterbox' }")).toEqual({
      width: 320,
      height: 180,
    });
  });
  it('adds the load() call to a scene', () => {
    const withCreate =
      "import { Scene } from '@blacklight/core';\n\nexport default class Level extends Scene {\n  override create() {\n    this.spawn('Hero');\n  }\n}\n";
    expect(addLayoutLoad(ts, withCreate, 'level.layout.json')).toBe(
      "import { Scene } from '@blacklight/core';\nimport layout from './level.layout.json';\n\nexport default class Level extends Scene {\n  override create() {\n    this.load(layout);\n    this.spawn('Hero');\n  }\n}\n",
    );
    const without =
      "import { Scene } from '@blacklight/core';\nexport default class Level extends Scene {\n  ticks = 0;\n  override update() {}\n}\n";
    expect(addLayoutLoad(ts, without, 'level.layout.json')).toContain(
      '  override create() {\n    this.load(layout);\n  }\n\n  override update() {}',
    );
    expect(
      addLayoutLoad(ts, "import layout from './level.layout.json';", 'level.layout.json'),
    ).toBeUndefined();
  });
});

describe('timelines', () => {
  it('places steps like Timeline in @blacklight/ui', () => {
    const file = parseTimeline(
      JSON.stringify({
        steps: [
          { to: '.a', keyframes: { x: [0, 1] }, duration: 0.5 },
          { label: 'items' },
          { to: '.b', keyframes: {}, at: '+0.1', duration: 0.2 },
          { sound: 'tick', at: '<' },
          { to: '.c', keyframes: {}, at: 'items+1' },
          { sound: 'x', at: 'nope' },
        ],
      }),
    );
    const { rows, duration } = timelineRows(file);
    expect(rows.map((r) => r.start)).toEqual([0, 0.5, 0.6, 0.6, 1.5, 1.8]);
    expect(duration).toBeCloseTo(1.8);
    expect(rows[5]!.error).toMatch(/Unknown label "nope"/);
  });
  it('edits steps', () => {
    let file = parseTimeline('{"steps":[{"label":"a"},{"label":"b"}]}');
    file = applyTimelineEdit(file, { op: 'move', index: 1, to: 0 });
    file = applyTimelineEdit(file, { op: 'add', step: { sound: 's' } });
    file = applyTimelineEdit(file, { op: 'remove', index: 1 });
    expect(printTimeline(file)).toBe('{\n  "steps": [{ "label": "b" }, { "sound": "s" }]\n}\n');
  });
});

describe('game.config.ts form', () => {
  const source = `import { defineConfig } from '@blacklight/core';

// My game.
export default defineConfig({
  name: 'My Game',
  id: 'com.example.game',
  version: '0.1.0',
  entry: 'title',
  resolution: { width: 1920, height: 1080 },
  seed: Date.now(),
});
`;
  it('reads literal fields and flags computed ones', () => {
    const state = readConfig(ts, source);
    expect(state.values).toMatchObject({ name: 'My Game', 'resolution.width': 1920 });
    expect(state.computed).toEqual(['seed']);
    expect(readConfig(ts, 'export const x = 1;').error).toMatch(/defineConfig/);
  });
  it('replaces, inserts, nests and removes values in place', () => {
    let next = setConfigValue(ts, source, 'name', "Joe's Game");
    next = setConfigValue(ts, next, 'resolution.mode', 'letterbox');
    next = setConfigValue(ts, next, 'ui.scale', 1.5);
    next = setConfigValue(ts, next, 'input.actions', { fire: ['KeyF'] });
    next = setConfigValue(ts, next, 'version', undefined);
    expect(next).toBe(`import { defineConfig } from '@blacklight/core';

// My game.
export default defineConfig({
  name: 'Joe\\'s Game',
  id: 'com.example.game',
  entry: 'title',
  resolution: { width: 1920, height: 1080, mode: 'letterbox' },
  seed: Date.now(),
  ui: { scale: 1.5 },
  input: { actions: { fire: ['KeyF'] } },
});
`);
    expect(readConfig(ts, next).values['input.actions']).toEqual({ fire: ['KeyF'] });
    expect(() =>
      setConfigValue(
        ts,
        'export default defineConfig({ resolution: base });',
        'resolution.width',
        1,
      ),
    ).toThrow(/computed/);
  });
});

describe('asset report', () => {
  it('finds unused files and what each scene preloads', () => {
    files({
      'game.config.ts': 'export default {}',
      'scenes/level/level.scene.ts':
        "export default class L { static assets = ['@assets/bg.png', '@assets/sfx/']; create() { this.audio.play('jump'); } }",
      'scenes/level/assets/local.png': heroPng,
      'scenes/menu/menu.scene.ts': "export default class M { static assets = ['/assets/bg']; }",
      'assets/bg.png': heroPng,
      'assets/sfx/jump.wav': 'abc',
      'assets/old.png': heroPng,
      'assets/font.woff2': 'f',
      'objects/coin/coin.object.ts': 'export default class Coin {}',
      'objects/coin/coin.png': 'cc',
    });
    const report = assetReport(root);
    const used = Object.fromEntries(report.assets.map((a) => [a.path, a.used]));
    expect(used).toEqual({
      'assets/bg.png': true,
      'assets/font.woff2': true,
      'assets/old.png': false,
      'assets/sfx/jump.wav': true,
      'objects/coin/coin.png': true,
      'scenes/level/assets/local.png': false,
    });
    const level = report.scenes.find((s) => s.scene === 'level')!;
    expect(level.files.map((f) => f.path).sort()).toEqual([
      'assets/bg.png',
      'assets/sfx/jump.wav',
      'objects/coin/coin.png',
      'scenes/level/assets/local.png',
    ]);
    expect(
      report.scenes
        .find((s) => s.scene === 'menu')!
        .files.map((f) => f.path)
        .sort(),
    ).toEqual(['assets/bg.png', 'objects/coin/coin.png']);
    expect(report.assets.find((a) => a.path === 'assets/bg.png')!.scenes).toEqual([
      'level',
      'menu',
    ]);
    expect(staticAssets('static override assets: string[] = [\'./a\', "@assets/b"];')).toEqual([
      './a',
      '@assets/b',
    ]);
    expect(resolveRef('../x/y.png', 'scenes/level')).toBe('scenes/x/y.png');
    expect(formatBytes(2048)).toBe('2.0 KB');
  });
});

describe('debug client', () => {
  function fakeSocket() {
    const listeners: Record<string, ((event: { data?: unknown }) => void)[]> = {};
    const sent: string[] = [];
    const socket: SocketLike = {
      readyState: 1,
      send: (data) => sent.push(data),
      close: () => listeners.close?.forEach((l) => l({})),
      addEventListener: (type, listener) => (listeners[type] ??= []).push(listener),
    };
    const emit = (type: string, data?: unknown) => listeners[type]?.forEach((l) => l({ data }));
    return { socket, sent, emit };
  }
  const info = { url: 'http://localhost:5371/', port: 5371, token: 'abc', pid: 1 };

  it('sends requests and resolves the matching response', async () => {
    const fake = fakeSocket();
    const pending = DebugClient.connect(info, (url, protocol) => {
      expect([url, protocol]).toEqual(['ws://localhost:5371/?token=abc', 'vite-hmr']);
      return fake.socket;
    });
    fake.emit('open');
    const client = await pending;
    fake.emit(
      'message',
      JSON.stringify({
        type: 'custom',
        event: 'blacklight:debug',
        data: { kind: 'event', client: 'g1', type: 'hello', data: { scene: 'a' } },
      }),
    );
    expect(client.games.get('g1')).toEqual({ client: 'g1', scene: 'a' });
    const result = client.request('objects', {}, { target: 'g1' });
    const request = JSON.parse(fake.sent[0]!) as { data: { id: string; target: string } };
    expect(request.data.target).toBe('g1');
    fake.emit(
      'message',
      JSON.stringify({
        type: 'custom',
        event: 'blacklight:debug',
        data: { kind: 'response', id: request.data.id, result: [1] },
      }),
    );
    await expect(result).resolves.toEqual([1]);
    const failing = client.request('nope');
    const second = JSON.parse(fake.sent[1]!) as { data: { id: string } };
    fake.emit(
      'message',
      JSON.stringify({
        type: 'custom',
        event: 'blacklight:debug',
        data: { kind: 'response', id: second.data.id, error: 'Unknown debug method' },
      }),
    );
    await expect(failing).rejects.toThrow('Unknown debug method');
    await expect(client.request('slow', {}, { timeout: 10 })).rejects.toThrow(
      /No game answered "slow"/,
    );
    client.close();
    await expect(client.request('x')).rejects.toThrow(/Not connected/);
  });

  it('builds the socket URL and the browser launch', () => {
    expect(socketUrl({ ...info, url: 'https://host:8443/game/' })).toBe(
      'wss://host:8443/?token=abc',
    );
    const launch = resolveLaunch(
      { type: 'blacklight', request: 'launch', browser: 'msedge' },
      '/game',
      info,
    );
    expect(launch).toMatchObject({
      type: 'msedge',
      url: info.url,
      webRoot: join('/game', '.blacklight'),
      pathMapping: { '/@fs/': '/' },
    });
    expect(() =>
      resolveLaunch({ type: 'blacklight', request: 'launch' }, '/game', undefined),
    ).toThrow(/blacklight dev/);
  });
});

describe('integration test paths', () => {
  it('compares Windows drive letters without case', () => {
    expect(comparablePath('c:\\Users\\RUNNER~1\\game\\.blacklight', 'win32')).toBe(
      comparablePath('C:\\Users\\RUNNER~1\\game\\.blacklight', 'win32'),
    );
    expect(comparablePath('c:\\Users\\a', 'win32')).toBe('C:\\Users\\a');
  });

  it('keeps the rest of the path and other platforms as they are', () => {
    expect(comparablePath('C:\\Users\\Runner\\c:', 'win32')).toBe('C:\\Users\\Runner\\c:');
    expect(comparablePath('/tmp/c:/game', 'linux')).toBe('/tmp/c:/game');
    expect(comparablePath('c:/game', 'darwin')).toBe('c:/game');
  });
});
