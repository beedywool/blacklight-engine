import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { build } from 'vite';
import { afterEach, describe, expect, it } from 'vitest';
import {
  blacklightModules,
  isNodeBuiltin,
  modulesModule,
  modulesTypes,
  nodeImportError,
  resolveModules,
} from '../src/modules';

let dir: string;
afterEach(() => rmSync(dir, { recursive: true, force: true }));

function game(dependencies: Record<string, string> = {}): string {
  dir = mkdtempSync(join(tmpdir(), 'blacklight-modules-'));
  writeFileSync(join(dir, 'package.json'), JSON.stringify({ name: 'g', dependencies }));
  return dir;
}

function file(path: string, content: string): void {
  mkdirSync(join(dir, path, '..'), { recursive: true });
  writeFileSync(join(dir, path), content);
}

describe('module resolution', () => {
  it('finds game-local modules first, then official and registry packages', () => {
    const root = game({
      '@blacklight/module-sqlite': '1.0.0',
      '@acme/blacklight-module-maps': '1.0.0',
      'blacklight-module-chat': '1.0.0',
    });
    file('modules/score/score.module.ts', 'export {};');
    const found = resolveModules(root, ['score', 'sqlite', 'maps', 'chat']);
    expect(found.map((m) => [m.name, m.label, m.local])).toEqual([
      ['score', 'modules/score/score.module.ts', true],
      ['sqlite', '@blacklight/module-sqlite', false],
      ['maps', '@acme/blacklight-module-maps', false],
      ['chat', 'blacklight-module-chat', false],
    ]);
  });

  it('says how to install a missing module', () => {
    const root = game();
    expect(() => resolveModules(root, ['sqlite'])).toThrow(
      'game.config.ts lists the module "sqlite", which is not installed: run `blacklight add sqlite`',
    );
  });

  it('generates the entry module and the types of game.modules', () => {
    const root = game({ '@blacklight/module-http': '1.0.0' });
    file('modules/score/score.module.ts', 'export {};');
    const modules = resolveModules(root, ['http', 'score']);
    const code = modulesModule(modules);
    expect(code).toContain(`import * as m0 from "@blacklight/module-http";`);
    expect(code).toContain(`pickModule(m1, "score", "modules/score/score.module.ts")`);
    expect(code).toContain('dev: import.meta.env.DEV');
    const types = modulesTypes(root, modules);
    expect(types).toContain(
      `"http": import('@blacklight/core').ModuleApiOf<typeof import("@blacklight/module-http"), "http">;`,
    );
    expect(types).toContain(`typeof import("../modules/score/score.module")`);
    expect(types).toContain('moduleConfigs: {');
  });
});

describe('Node imports in game code (MOD-04)', () => {
  it('recognizes Node built-ins', () => {
    expect(['fs', 'node:fs', 'fs/promises', 'child_process'].every(isNodeBuiltin)).toBe(true);
    expect(['pixi.js', 'vue', 'events-lite'].some(isNodeBuiltin)).toBe(false);
  });

  it('fails the build with a message that says where the code belongs', async () => {
    const root = game();
    file('game.config.ts', 'export default {};');
    file('index.html', '<script type="module" src="./scenes/main.ts"></script>');
    file('scenes/main.ts', "import { readFileSync } from 'node:fs';\nconsole.log(readFileSync);\n");
    const run = build({
      root,
      logLevel: 'silent',
      configFile: false,
      plugins: [blacklightModules({ root })],
      build: { outDir: join(root, 'dist'), write: false },
    });
    await expect(run).rejects.toThrow(
      'scenes/main.ts imports "node:fs", which only runs in Node.js.',
    );
    await expect(run).rejects.toThrow(/defineNative/);
  });

  it('refuses native addons imported from game code', async () => {
    const root = game({ 'fake-addon': '1.0.0' });
    file(
      'node_modules/fake-addon/package.json',
      JSON.stringify({ name: 'fake-addon', main: 'index.js', gypfile: true }),
    );
    file('node_modules/fake-addon/index.js', 'module.exports = {};');
    file('index.html', '<script type="module" src="./scenes/main.ts"></script>');
    file('scenes/main.ts', "import addon from 'fake-addon';\nconsole.log(addon);\n");
    const run = build({
      root,
      logLevel: 'silent',
      configFile: false,
      plugins: [blacklightModules({ root })],
      build: { outDir: join(root, 'dist'), write: false },
    });
    await expect(run).rejects.toThrow('imports "fake-addon", which only runs in Node.js');
  });

  it('writes the message with the file relative to the game', () => {
    expect(nodeImportError('fs', '/game/objects/a/a.object.ts', '/game')).toMatch(
      /^objects\/a\/a\.object\.ts imports "fs"/,
    );
  });
});
