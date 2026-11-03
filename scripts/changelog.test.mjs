// DOC-07: the generated changelog, from parsed commits and from a real throwaway repository.
import { execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { parseCommit, readReleases, renderChangelog, renderNotes } from './changelog.mjs';

describe('parseCommit', () => {
  it('reads the area, the text and breaking changes', () => {
    expect(
      parseCommit({ hash: 'abcdef123', subject: 'core: cap catch-up steps', body: '' }),
    ).toEqual({ hash: 'abcdef1', area: 'core', text: 'cap catch-up steps', breaking: false });
    expect(parseCommit({ hash: 'a', subject: 'ui!: rename MenuList', body: '' }).breaking).toBe(
      true,
    );
    expect(
      parseCommit({ hash: 'a', subject: 'net: x', body: 'BREAKING CHANGE: rooms need a name' })
        .breaking,
    ).toBe(true);
    expect(parseCommit({ hash: 'a', subject: 'Fix things', body: '' }).area).toBe('other');
    // `Docs:` and `docs:` are one area.
    expect(parseCommit({ hash: 'a', subject: 'Docs: typo', body: '' }).area).toBe('docs');
    expect(
      parseCommit({ hash: 'a', subject: 'fix(cli): pre-bundle deps', body: '' }),
    ).toMatchObject({ area: 'cli', text: 'pre-bundle deps', breaking: false });
    expect(parseCommit({ hash: 'a', subject: 'feat(ui)!: drop X', body: '' }).breaking).toBe(true);
  });
});

describe('renderChangelog', () => {
  it('groups by release and area, breaking changes first, other last', () => {
    const text = renderChangelog([
      {
        name: 'Unreleased',
        commits: [
          { hash: '1111111', subject: 'ui: new widget', body: '' },
          { hash: '2222222', subject: 'Fix typo', body: '' },
        ],
      },
      { name: '1.1.0', date: '2026-11-02', commits: [] },
      {
        name: '1.0.0',
        date: '2026-11-01',
        commits: [
          { hash: '3333333', subject: 'core!: scenes are classes', body: '' },
          { hash: '4444444', subject: 'cli: build web', body: '' },
        ],
      },
    ]);
    expect(text).toBe(`# Changelog

Generated from the git history by \`pnpm changelog\` (\`scripts/changelog.mjs\`); do not edit by hand.
Versions follow [semantic versioning](https://semver.org) as described in \`CONTRIBUTING.md\`.

## Unreleased

### ui

- new widget (1111111)

### other

- Fix typo (2222222)

## 1.0.0 (2026-11-01)

### Breaking changes

- core: scenes are classes (3333333)

### cli

- build web (4444444)

### core

- scenes are classes (3333333)
`);
  });
});

describe('readReleases', () => {
  let dir;
  afterEach(() => rmSync(dir, { recursive: true, force: true }));

  it('splits the history at version tags and skips merges', () => {
    dir = mkdtempSync(join(tmpdir(), 'blacklight-changelog-'));
    // Commits one minute apart: the log orders them by date.
    let minute = 0;
    const git = (...args) => {
      const date = `2026-11-01T10:${String(minute).padStart(2, '0')}:00Z`;
      return execFileSync('git', args, {
        cwd: dir,
        encoding: 'utf8',
        env: {
          ...process.env,
          GIT_AUTHOR_NAME: 'Test',
          GIT_AUTHOR_EMAIL: 'test@example.com',
          GIT_COMMITTER_NAME: 'Test',
          GIT_COMMITTER_EMAIL: 'test@example.com',
          GIT_AUTHOR_DATE: date,
          GIT_COMMITTER_DATE: date,
        },
      });
    };
    const commit = (message) => {
      minute++;
      writeFileSync(join(dir, 'file.txt'), message);
      git('add', 'file.txt');
      git('commit', '-q', '-m', message);
    };
    git('init', '-q', '-b', 'main');
    commit('core: first');
    git('tag', 'v1.0.0');
    commit('ui: second');
    git('checkout', '-q', '-b', 'topic');
    commit('cli: third');
    git('checkout', '-q', 'main');
    git('merge', '-q', '--no-ff', '-m', 'Merge topic', 'topic');
    const releases = readReleases(dir);
    expect(releases.map((r) => [r.name, r.date, r.commits.map((c) => c.subject)])).toEqual([
      ['Unreleased', undefined, ['cli: third', 'ui: second']],
      ['1.0.0', '2026-11-01', ['core: first']],
    ]);
    // The body of a GitHub release: one section, headings one level up.
    expect(renderNotes(releases, 'v1.0.0')).toMatch(/^## core\n\n- first \([0-9a-f]{7}\)\n$/);
    expect(renderNotes(releases, 'Unreleased')).toContain('## cli\n\n- third');
    expect(() => renderNotes(releases, '9.9.9')).toThrow(/git tag v9.9.9/);
    // A dozen git processes: well over the 5 s default on GitHub's Windows runners.
  }, 30_000);
});
