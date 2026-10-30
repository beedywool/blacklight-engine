// DOC-07: the files an open-source repository needs are present and say what they must.
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const root = join(import.meta.dirname, '..');
const read = (file) => readFileSync(join(root, file), 'utf8');

describe('open-source files', () => {
  it.each([
    'README.md',
    'CONTRIBUTING.md',
    'CODE_OF_CONDUCT.md',
    'LICENSE',
    'THIRD_PARTY_LICENSES.md',
    'CHANGELOG.md',
    '.github/pull_request_template.md',
    '.github/ISSUE_TEMPLATE/bug.yml',
    '.github/ISSUE_TEMPLATE/feature.yml',
  ])('%s exists', (file) => {
    expect(existsSync(join(root, file))).toBe(true);
  });

  it('is MIT licensed, with a semver policy and a generated changelog', () => {
    expect(read('LICENSE')).toMatch(/^MIT License/);
    expect(JSON.parse(read('package.json')).license).toBe('MIT');
    expect(read('CONTRIBUTING.md')).toContain('## Versions and releases');
    expect(read('CHANGELOG.md')).toMatch(/^# Changelog\n\nGenerated from the git history/);
  });
});
