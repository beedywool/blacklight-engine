import { mkdirSync, mkdtempSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { cac } from 'cac';
import { afterEach, describe, expect, it } from 'vitest';
import { registerToolCommands, runWeb } from '../src/commands/tools';
import { formatDoctor, runDoctor, type DoctorEnv } from '../src/doctor';
import { validate, type Schema } from '../src/json-schema';
import { formatLint, lintProject } from '../src/lint';
import { runners } from '../src/targets/runners';
import { hotCode, hotTarget } from '../src/tooling';

describe('hot reload transform', () => {
  it('finds scene and object modules by their project path', () => {
    expect(hotTarget('scenes/level/level.scene.ts')).toEqual({
      kind: 'scene',
      name: 'level',
      path: 'scenes/level',
    });
    expect(hotTarget('objects/big-enemy/big-enemy.object.ts')).toEqual({
      kind: 'object',
      name: 'BigEnemy',
      path: 'objects/big-enemy',
    });
    expect(hotTarget('scenes/level/objects/shadow/shadow.object.js')).toEqual({
      kind: 'object',
      name: 'Shadow',
      path: 'scenes/level/objects/shadow',
      scene: 'level',
    });
    expect(hotTarget('scenes/level/menu.scene.ts')).toBeUndefined();
    expect(hotTarget('ui/Hud.vue')).toBeUndefined();
  });

  it('accepts updates and falls back to a reload', () => {
    const code = hotCode({ kind: 'scene', name: 'level', path: 'scenes/level' });
    expect(code).toContain('import.meta.hot.accept(');
    expect(code).toContain('globalThis.__blacklightHot');
    expect(code).toContain('import.meta.hot.invalidate()');
  });
});

function env(overrides: Partial<DoctorEnv> = {}, commands: Record<string, string> = {}): DoctorEnv {
  return {
    platform: 'linux',
    nodeVersion: 'v24.1.0',
    env: {},
    exec: (command, args) => commands[[command, ...args].join(' ')],
    exists: () => false,
    resolve: () => undefined,
    ...overrides,
  };
}

describe('doctor', () => {
  it('reports what each target needs', () => {
    const reports = runDoctor(env({}, { 'pnpm --version': '12.16.1\n' }));
    expect(reports.map((r) => r.target)).toEqual([
      'web',
      'win',
      'mac',
      'linux',
      'steam',
      'android',
      'ios',
    ]);
    const web = reports.find((r) => r.target === 'web')!;
    expect(web.ready).toBe(true);
    expect(web.checks.map((c) => `${c.name}: ${c.detail}`)).toEqual([
      'Node.js: v24.1.0',
      'pnpm: 12.16.1',
    ]);
    const android = reports.find((r) => r.target === 'android')!;
    expect(android.ready).toBe(false);
    expect(android.checks.find((c) => c.name === 'Android SDK')!.fix).toMatch(/ANDROID_HOME/);
  });

  it('accepts an Android setup and treats signing as optional', () => {
    const [android] = runDoctor(
      env(
        {
          env: { ANDROID_HOME: '/sdk', JAVA_HOME: '/jdk' },
          exists: (p) => p === join('/sdk', 'platform-tools', 'adb'),
        },
        {
          'pnpm --version': '12',
          [`${join('/jdk', 'bin', 'java')} -version`]: 'openjdk version "21.0.4" 2024-07-16',
        },
      ),
      ['android'],
    );
    expect(android!.ready).toBe(true);
    expect(android!.checks.find((c) => c.name === 'Android release keystore')!.ok).toBe(false);
  });

  it('needs a Mac for mac and iOS, and finds signing identities there', () => {
    const linux = runDoctor(env(), ['ios'])[0]!;
    expect(linux.checks.find((c) => c.name === 'macOS host')!.ok).toBe(false);
    const mac = runDoctor(
      env(
        { platform: 'darwin', env: { APPLE_TEAM_ID: 'ABCDE12345' } },
        {
          'pnpm --version': '12',
          'xcodebuild -version': 'Xcode 26.1\nBuild version 17B55',
          'security find-identity -v -p codesigning':
            '  1) 0123 "Apple Distribution: Studio (ABCDE12345)"\n',
        },
      ),
      ['ios'],
    )[0]!;
    expect(mac.ready).toBe(true);
    expect(mac.checks.map((c) => c.ok)).toEqual([true, true, true, true, true]);
  });

  it('rejects an old Node and prints fixes', () => {
    const [web] = runDoctor(env({ nodeVersion: 'v20.0.0' }), ['web']);
    expect(web!.ready).toBe(false);
    expect(formatDoctor([web!])).toContain('needs 24 or later');
  });
});

describe('json-schema', () => {
  const schema: Schema = {
    type: 'object',
    required: ['a'],
    additionalProperties: false,
    properties: {
      a: { $ref: '#/$defs/n' },
      b: { oneOf: [{ type: 'string' }, { type: 'array', items: { type: 'integer' } }] },
    },
    $defs: { n: { type: 'number', exclusiveMinimum: 0 } },
  };
  it('validates refs, oneOf, required and extra properties', () => {
    expect(validate({ a: 1, b: [1, 2] }, schema)).toEqual([]);
    expect(validate({ a: 0, b: [1.5], c: 1 }, schema).map((e) => `${e.path} ${e.message}`)).toEqual(
      ['a must be > 0', 'b.0 must be integer, not number', 'c is not an allowed property'],
    );
    expect(validate({}, schema)[0]!.message).toBe('is missing "a"');
  });
});

let root: string | undefined;
afterEach(() => {
  if (root) rmSync(root, { recursive: true, force: true });
});

function game(files: Record<string, string>): string {
  const dir = mkdtempSync(join(tmpdir(), 'blacklight-lint-'));
  root = dir;
  for (const [path, content] of Object.entries(files)) {
    mkdirSync(join(dir, path, '..'), { recursive: true });
    writeFileSync(join(dir, path), content);
  }
  // The game's own @blacklight/core (schemas, config validation), as an installed game has it.
  symlinkSync(
    resolve(import.meta.dirname, '../../../e2e/fixtures/runtime/node_modules'),
    join(dir, 'node_modules'),
  );
  return dir;
}

const CONFIG = `export default { name: 'T', id: 'dev.t', version: '1.0.0', entry: 'level', resolution: { width: 320, height: 180 }, input: { actions: { fire: ['KeyF'] } } };`;

describe('lint', () => {
  it('passes a clean game', async () => {
    const result = await lintProject(
      game({
        'game.config.ts': CONFIG,
        'scenes/level/level.scene.ts': `export default class Level { static assets = ['./assets/hit']; update() { this.input.pressed('fire'); this.input.pressed('jump'); } }`,
        'scenes/level/assets/hit.wav': 'x',
        'objects/hero/hero.object.ts': `export default class Hero { update() { this.play('run'); this.play('walk-left'); } }`,
        'objects/hero/hero.anim.json': JSON.stringify({
          source: './hero.png',
          animations: { run: {}, 'walk-right': {} },
        }),
        'objects/hero/hero.png': 'x',
        'scenes/level/level.layout.json': JSON.stringify({
          objects: [{ type: 'Hero', x: 1, y: 2 }],
        }),
      }),
      { eslint: false },
    );
    expect(result.issues).toEqual([]);
    expect(formatLint(result)).toContain('No problems found.');
  });

  it('reports naming, schema, asset, scene, action and animation problems', async () => {
    const { issues } = await lintProject(
      game({
        'game.config.ts': CONFIG,
        'scenes/level/level.scene.ts': `export default class Level {\n  static assets = ['./assets/missing.png'];\n  update() { this.input.pressed('fier'); this.goto('titel'); }\n}`,
        'scenes/menu/main.scene.ts': 'export default class Menu {}',
        'objects/hero/hero.object.ts': `export default class Hero { update() { this.play('jump'); } }`,
        'objects/hero/hero.anim.json': JSON.stringify({
          source: './nope.png',
          fps: -1,
          animations: { run: {} },
        }),
        'objects/coin/coin.object.ts': 'export class Coin {}',
        'scenes/level/level.layout.json': JSON.stringify({
          objects: [{ type: 'Ghost', x: 0, y: 0 }],
        }),
      }),
      { eslint: false },
    );
    expect(issues.map((i) => `${i.file}${i.line ? `:${i.line}` : ''} ${i.rule}`)).toEqual([
      'objects/coin/coin.object.ts:1 default-export',
      'objects/hero/hero.anim.json anim-schema',
      'objects/hero/hero.anim.json anim-source',
      'objects/hero/hero.object.ts:1 unknown-animation',
      'scenes/level/level.layout.json layout-object',
      'scenes/level/level.scene.ts:2 missing-asset',
      'scenes/level/level.scene.ts:3 unknown-scene',
      'scenes/level/level.scene.ts:3 unknown-action',
      'scenes/menu/main.scene.ts scene-file-name',
    ]);
  });

  it('reports an invalid game.config.ts', async () => {
    const { issues } = await lintProject(
      game({ 'game.config.ts': 'export default { name: 1 };' }),
      { eslint: false },
    );
    expect(issues[0]!.rule).toBe('config');
  });
});

describe('run', () => {
  it('serves the game for the web target', async () => {
    const previous = process.env.BROWSER;
    process.env.BROWSER = 'none';
    const server = await runWeb(resolve(import.meta.dirname, '../../../e2e/fixtures/tooling'), 5373);
    try {
      const page = await fetch('http://localhost:5373/');
      expect(page.ok).toBe(true);
      expect(await page.text()).toContain('<div id="game"></div>');
    } finally {
      await server.close();
      process.env.BROWSER = previous;
      if (previous === undefined) delete process.env.BROWSER;
    }
  });

  it('calls the runner a platform registered, and explains when none is', async () => {
    const cli = cac('blacklight');
    registerToolCommands(cli);
    const calls: unknown[] = [];
    runners.linux = async (options) => {
      calls.push({ root: options.root, device: options.device });
    };
    cli.parse(['node', 'blacklight', 'run', '/game', '--target', 'linux', '--device', 'x'], {
      run: false,
    });
    await cli.runMatchedCommand();
    expect(calls).toEqual([{ root: resolve('/game'), device: 'x' }]);
    delete runners.linux;
    cli.parse(['node', 'blacklight', 'run', '/game', '--target', 'ios'], { run: false });
    await expect(cli.runMatchedCommand()).rejects.toThrow(/No runner for the "ios" target/);
    cli.parse(['node', 'blacklight', 'run', '/game', '--target', 'ps5'], { run: false });
    await expect(cli.runMatchedCommand()).rejects.toThrow(/Unknown target "ps5"/);
  });
});
