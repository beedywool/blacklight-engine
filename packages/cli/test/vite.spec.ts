import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { createViteConfig, prepareProject } from '../src/vite';

let dir: string;
afterEach(() => rmSync(dir, { recursive: true, force: true }));

function game(): string {
  dir = mkdtempSync(join(tmpdir(), 'blacklight-cli-'));
  writeFileSync(join(dir, 'game.config.ts'), 'export default {};\n');
  mkdirSync(join(dir, 'scenes', 'title'), { recursive: true });
  return dir;
}

describe('prepareProject', () => {
  it('writes the generated entry', () => {
    const generated = prepareProject(game());
    expect(readFileSync(join(generated, 'index.html'), 'utf8')).toContain('src="./main.ts"');
    expect(readFileSync(join(generated, 'main.ts'), 'utf8')).toContain(
      "import.meta.glob('../scenes/*/*.scene.{ts,js}')",
    );
  });

  it('explains what to do outside a game folder', () => {
    dir = mkdtempSync(join(tmpdir(), 'blacklight-cli-'));
    expect(() => prepareProject(dir)).toThrow(/create-blacklight\.tgz my-game/);
  });
});

describe('createViteConfig', () => {
  it('roots Vite in the generated folder and builds to dist/', () => {
    const root = game();
    const config = createViteConfig(root);
    expect(config.root).toBe(join(root, '.blacklight'));
    expect(config.build?.outDir).toBe(join(root, 'dist'));
    expect(config.base).toBe('./');
  });

  it('pre-bundles the dependencies of the excluded UI package', () => {
    const { optimizeDeps } = createViteConfig(game());
    expect(optimizeDeps?.exclude).toContain('@blacklight/ui');
    expect(optimizeDeps?.include).toEqual(
      expect.arrayContaining([
        '@blacklight/ui > pixi.js',
        '@blacklight/ui > inkjs',
        '@blacklight/ui > motion',
      ]),
    );
  });
});
