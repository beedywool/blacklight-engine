// PF-09: every project created from any template gets .github/workflows/build.yml, which builds
// every target. The workflow is parsed here and its jobs checked.
import { spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, describe, expect, it } from 'vitest';
import { parse } from 'yaml';
import { scaffold } from '../src/scaffold';

const sharedDir = fileURLToPath(new URL('../shared', import.meta.url));
const workflowFile = join(sharedDir, '_github', 'workflows', 'build.yml');

interface Step {
  uses?: string;
  run?: string;
  if?: string;
  with?: Record<string, unknown>;
}
interface Job {
  'runs-on': string;
  strategy?: { matrix: { include: { os: string; target: string }[] } };
  steps: Step[];
}
interface Workflow {
  name: string;
  on: Record<string, unknown>;
  jobs: Record<string, Job>;
}

const workflow = parse(readFileSync(workflowFile, 'utf8')) as Workflow;
const runs = (job: Job) => job.steps.map((step) => step.run ?? '').join('\n');

describe('build workflow', () => {
  it('runs on pushes, pull requests and by hand', () => {
    expect(Object.keys(workflow.on).sort()).toEqual(['pull_request', 'push', 'workflow_dispatch']);
  });

  it('builds the web target', () => {
    expect(workflow.jobs.web!['runs-on']).toBe('ubuntu-latest');
    expect(runs(workflow.jobs.web!)).toContain('blacklight build --target web');
  });

  it('builds Windows, macOS and Linux each on its own OS', () => {
    const desktop = workflow.jobs.desktop!;
    expect(desktop['runs-on']).toBe('${{ matrix.os }}');
    expect(desktop.strategy!.matrix.include).toEqual([
      { os: 'windows-latest', target: 'win' },
      { os: 'macos-latest', target: 'mac' },
      { os: 'ubuntu-latest', target: 'linux' },
    ]);
    expect(runs(desktop)).toContain('blacklight build --target ${{ matrix.target }}');
    expect(runs(desktop)).toContain('xvfb-run -a pnpm exec blacklight build --target linux');
  });

  it('builds Android on Linux and iOS on a macOS runner', () => {
    expect(workflow.jobs.android!['runs-on']).toBe('ubuntu-latest');
    expect(runs(workflow.jobs.android!)).toContain('blacklight build --target android');
    expect(workflow.jobs.android!.steps.some((s) => s.uses?.startsWith('actions/setup-java'))).toBe(
      true,
    );
    expect(workflow.jobs.ios!['runs-on']).toMatch(/^macos-/);
    expect(runs(workflow.jobs.ios!)).toContain('blacklight build --target ios');
  });

  it('installs with the lockfile and uploads what every job built', () => {
    for (const [name, job] of Object.entries(workflow.jobs)) {
      expect(runs(job), name).toContain('pnpm install --frozen-lockfile');
      const upload = job.steps.find((s) => s.uses?.startsWith('actions/upload-artifact'));
      expect(upload, name).toBeDefined();
    }
  });

  it('keeps secrets out of the file', () => {
    const text = readFileSync(workflowFile, 'utf8');
    for (const match of text.matchAll(/(\w+): \$\{\{ (.+?) \}\}/g)) {
      if (match[2]!.startsWith('secrets.')) expect(match[2]).toBe(`secrets.${match[1]}`);
    }
  });

  // actionlint is a Go binary: checked when the developer has it installed (CI installs it).
  const actionlint = spawnSync('actionlint', ['-version'], { encoding: 'utf8' });
  it.skipIf(actionlint.error !== undefined)('passes actionlint', () => {
    const result = spawnSync('actionlint', ['-no-color', workflowFile], { encoding: 'utf8' });
    expect(result.stdout + result.stderr).toBe('');
    expect(result.status).toBe(0);
  });
});

describe('scaffold', () => {
  let work: string;
  afterEach(() => rmSync(work, { recursive: true, force: true }));

  it('gives every template the workflow and pnpm settings without replacing its own files', () => {
    work = mkdtempSync(join(tmpdir(), 'create-blacklight-'));
    const templatesDir = join(work, 'templates');
    for (const name of ['a', 'b']) {
      mkdirSync(join(templatesDir, name), { recursive: true });
      writeFileSync(join(templatesDir, name, 'package.json'), '{"name":"t"}');
    }
    writeFileSync(join(templatesDir, 'b', 'pnpm-workspace.yaml'), 'own: true\n');
    for (const template of ['a', 'b']) {
      const dir = scaffold({
        dir: join(work, template),
        template,
        templatesDir,
        engineVersion: '1.0.0',
        sharedDir,
        packageManager: 'pnpm@12.0.0',
      });
      expect(readFileSync(join(dir, '.github/workflows/build.yml'), 'utf8')).toBe(
        readFileSync(workflowFile, 'utf8'),
      );
      expect(JSON.parse(readFileSync(join(dir, 'package.json'), 'utf8')).packageManager).toBe(
        'pnpm@12.0.0',
      );
    }
    expect(readFileSync(join(work, 'a', 'pnpm-workspace.yaml'), 'utf8')).toContain(
      'electron: true',
    );
    expect(readFileSync(join(work, 'b', 'pnpm-workspace.yaml'), 'utf8')).toBe('own: true\n');
  });
});
