// NF-04: `@blacklight/core` without Pixi, Vue and Three stays under 150 KB gzip. Measured the way a
// game ships it: the built package bundled and minified by Vite, Pixi left out; chunks the engine
// loads on demand (the gamepad database) are reported apart and not counted.
import { mkdtempSync, rmSync } from 'node:fs';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { gzipSync } from 'node:zlib';
import { build, type Rollup } from 'vite';
import { describe, expect, it } from 'vitest';

const LIMIT = 150 * 1024;

describe('core size (NF-04)', () => {
  it('is under 150 KB gzip without Pixi, Vue and Three', async () => {
    const entry = createRequire(import.meta.url).resolve('@blacklight/core');
    const outDir = mkdtempSync(join(tmpdir(), 'blacklight-core-size-'));
    try {
      const result = (await build({
        configFile: false,
        logLevel: 'silent',
        root: dirname(entry),
        build: {
          outDir,
          write: false,
          minify: true,
          lib: { entry, formats: ['es'], fileName: 'core' },
          rolldownOptions: { external: [/^pixi\.js/, /^vue/, /^three/] },
        },
      })) as Rollup.RollupOutput[];
      const chunks = result.flatMap((output) => output.output).filter((c) => c.type === 'chunk');
      const gzip = (chunk: Rollup.OutputChunk) => gzipSync(chunk.code, { level: 9 }).length;
      const main = chunks.filter((c) => c.isEntry).reduce((sum, c) => sum + gzip(c), 0);
      const lazy = chunks.filter((c) => !c.isEntry).reduce((sum, c) => sum + gzip(c), 0);
      console.log(
        `NF-04 core: ${(main / 1024).toFixed(1)} KB gzip, lazy chunks ${(lazy / 1024).toFixed(1)} KB`,
      );
      expect(main).toBeGreaterThan(10 * 1024);
      expect(main).toBeLessThan(LIMIT);
    } finally {
      rmSync(outDir, { recursive: true, force: true });
    }
  }, 120_000);
});
