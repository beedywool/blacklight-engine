import { Linter, RuleTester } from 'eslint';
import tseslint from 'typescript-eslint';
import { describe, expect, it } from 'vitest';
import { deterministic } from '../src/deterministic';
import { blacklight, SIMULATION_FILES } from '../src/index';

RuleTester.describe = describe;
RuleTester.it = it;
RuleTester.itOnly = it.only;

const tester = new RuleTester({
  languageOptions: { parser: tseslint.parser, ecmaVersion: 2023, sourceType: 'module' },
});

tester.run('deterministic (whole file)', deterministic, {
  valid: [
    'const a = DMath.sin(x) + DMath.atan2(y, x);',
    'const r = Math.sqrt(x) + Math.floor(y) + Math.abs(z) + Math.max(a, b) + Math.PI;',
    'const n = this.scene.random.next();',
    // A local variable named Math is not the global.
    "import { Math } from './my-math'; Math.sin(1);",
    'function f(Date) { return Date.now(); }',
    'const t = this.scene.steps * 2;',
  ],
  invalid: [
    { code: 'const a = Math.sin(x);', errors: [{ messageId: 'math' }] },
    { code: "const a = Math['cos'](x);", errors: [{ messageId: 'math' }] },
    { code: 'const a = Math.sinh(x);', errors: [{ messageId: 'mathOther' }] },
    { code: 'const a = Math.random();', errors: [{ messageId: 'random' }] },
    { code: 'const { sin, random, floor } = Math;', errors: 2 },
    { code: 'const t = Date.now();', errors: [{ messageId: 'clock' }] },
    { code: 'const t = new Date();', errors: [{ messageId: 'clock' }] },
    { code: 'const t = Date();', errors: [{ messageId: 'clock' }] },
    { code: 'const t = performance.now();', errors: [{ messageId: 'clock' }] },
    { code: 'crypto.getRandomValues(buffer);', errors: [{ messageId: 'crypto' }] },
    { code: 'const id = globalThis.crypto.randomUUID();', errors: [{ messageId: 'crypto' }] },
    { code: 'const d = x ** 2;', errors: [{ messageId: 'power' }] },
    { code: 'x **= 2;', errors: [{ messageId: 'power' }] },
  ],
});

tester.run('deterministic (marked)', deterministic, {
  valid: [
    { code: 'const a = Math.random();', options: [{ scope: 'marked' }] },
    {
      code: 'class Hud { static deterministic = false; update() { return Math.sin(1); } }',
      options: [{ scope: 'marked' }],
    },
    {
      code: 'class A { static deterministic = true; } function f() { return Math.random(); }',
      options: [{ scope: 'marked' }],
    },
  ],
  invalid: [
    {
      code: 'class Ball { static deterministic = true; update() { this.x += Math.cos(this.angle); } }',
      options: [{ scope: 'marked' }],
      errors: [{ messageId: 'math' }],
    },
    {
      code: '// @blacklight-deterministic\nexport function step() { return Date.now(); }',
      options: [{ scope: 'marked' }],
      errors: [{ messageId: 'clock' }],
    },
  ],
});

describe('configs.recommended', () => {
  const linter = new Linter();
  const config = [
    { files: ['**/*.ts'], languageOptions: { parser: tseslint.parser } },
    ...blacklight.configs.recommended,
  ] as Linter.Config[];
  const lint = (code: string, filename: string) =>
    linter.verify(code, config, { filename }).map((m) => m.ruleId);

  it('checks online scene folders, sim folders and .sim files', () => {
    expect(SIMULATION_FILES.length).toBeGreaterThan(0);
    const code = 'export const x = Math.random();';
    expect(lint(code, 'scenes/push-push-online/push-push-online.scene.ts')).toEqual([
      'blacklight/deterministic',
    ]);
    expect(lint(code, 'src/sim/physics.ts')).toEqual(['blacklight/deterministic']);
    expect(lint(code, 'src/world.sim.ts')).toEqual(['blacklight/deterministic']);
    expect(lint(code, 'scenes/title/title.scene.ts')).toEqual([]);
  });

  it('checks marked classes anywhere', () => {
    const code =
      'export class Puck { static deterministic = true; step() { return Math.hypot(1, 2); } }';
    expect(lint(code, 'objects/puck/puck.object.ts')).toEqual(['blacklight/deterministic']);
  });
});
