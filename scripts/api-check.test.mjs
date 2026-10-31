// NF-06: the API check fails on an undocumented symbol, a missing example, `any`, a default export
// and `typeof` of a private declaration, passes on a clean entry point, and covers every typed
// entry of every published package.
import { readdirSync, readFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { apiReport, findProblems, loadApi } from './api-check.mjs';
import { ENTRY_POINTS } from './api-entries.mjs';

const root = fileURLToPath(new URL('../', import.meta.url));
const fixtures = fileURLToPath(new URL('./fixtures/api-check/', import.meta.url));

async function check(entries) {
  const api = await loadApi({ entries, base: fixtures, tsconfig: `${fixtures}tsconfig.json` });
  return { ...findProblems(api), report: apiReport(api, entries) };
}

describe('api-check', () => {
  it('passes a documented, typed entry point and leaves @internal symbols out', async () => {
    const { problems, symbols, report } = await check({ clean: 'clean.d.ts' });
    expect(problems).toEqual([]);
    // approach, Counter, value, add, StepOptions, step, values.
    expect(symbols).toBe(7);
    expect(report).toContain(
      'function approach(value: number, target: number, step: number): number',
    );
    expect(report).toContain('get value(): number; set value(next: number)');
    expect(report).toContain('values: Record<string, unknown>');
    expect(report).not.toContain('reset');
    expect(report).not.toContain('internalHelper');
  }, 30_000);

  it('reports each kind of problem', async () => {
    const { problems } = await check({ broken: 'broken.d.ts' });
    const has = (pattern) => problems.some((p) => pattern.test(p));
    expect(has(/^broken: undocumented \(function\) has no TSDoc comment/)).toBe(true);
    expect(has(/^broken: Shape\.width \(property\) has no TSDoc comment/)).toBe(true);
    expect(has(/^broken: noExample \(function\) has no @example/)).toBe(true);
    expect(has(/^broken: undocumented \(function\) has no @example/)).toBe(true);
    expect(has(/^broken: loose\.value \(parameter\) uses `any`/)).toBe(true);
    expect(has(/^broken: loose \(call signature\) uses `any`/)).toBe(true);
    expect(has(/^broken: has a default export/)).toBe(true);
    expect(
      has(/^broken: Hidden \(type alias\) uses `typeof createHidden`, which is not exported/),
    ).toBe(true);
    // Documented, with an example, typed: not reported.
    expect(has(/^broken: Shape \(interface\)/)).toBe(false);
    expect(has(/^broken: loose \(function\) has no/)).toBe(false);
  }, 30_000);
});

describe('api-entries', () => {
  it('lists every typed export of every published package, with nothing extra', () => {
    const folders = ['packages', 'packages/modules'].flatMap((dir) =>
      readdirSync(`${root}${dir}`).map((name) => `${dir}/${name}`),
    );
    const expected = {};
    for (const folder of folders) {
      const file = `${root}${folder}/package.json`;
      if (!existsSync(file)) continue;
      const pkg = JSON.parse(readFileSync(file, 'utf8'));
      if (pkg.private) continue;
      for (const [path, target] of Object.entries(pkg.exports ?? {})) {
        if (typeof target !== 'object' || !target.types) continue;
        const specifier = path === '.' ? pkg.name : `${pkg.name}/${path.slice(2)}`;
        expected[specifier] = `${folder}/${target.types.slice(2)}`;
      }
    }
    expect(ENTRY_POINTS).toEqual(expected);
  });
});
