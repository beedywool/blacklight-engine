// Writes CHANGELOG.md from the git history (DOC-07): one section per `v*` tag, newest first,
// plus "Unreleased" for the commits after the last tag. Commits follow `area: what changed`
// (CONTRIBUTING.md) and are grouped by area; `area!: …` or a `BREAKING CHANGE:` line in the body
// lists the commit under "Breaking changes". Merge commits are left out.
//
// Run: pnpm changelog (writes CHANGELOG.md; part of the release steps in CONTRIBUTING.md)
import { execFileSync } from 'node:child_process';
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const FIELD = '\x1f';
const RECORD = '\x1e';

/**
 * Parses one commit.
 * @param {{ hash: string, subject: string, body: string }} commit
 */
export function parseCommit({ hash, subject, body }) {
  const match = /^([\w./@-]+(?:, ?[\w./@-]+)*)(!)?: (.+)$/.exec(subject);
  const breaking = !!match?.[2] || /^BREAKING CHANGE:/m.test(body);
  return {
    hash: hash.slice(0, 7),
    area: match ? match[1] : 'other',
    text: match ? match[3] : subject,
    breaking,
  };
}

/**
 * Markdown of the changelog.
 * @param {{ name: string, date?: string, commits: { hash: string, subject: string, body: string }[] }[]} releases
 *   Newest first; `date` is omitted for unreleased work.
 */
export function renderChangelog(releases) {
  const lines = [
    '# Changelog',
    '',
    'Generated from the git history by `pnpm changelog` (`scripts/changelog.mjs`); do not edit by hand.',
    'Versions follow [semantic versioning](https://semver.org) as described in `CONTRIBUTING.md`.',
  ];
  for (const release of releases) {
    const commits = release.commits.map(parseCommit);
    if (commits.length === 0) continue;
    lines.push('', `## ${release.name}${release.date ? ` (${release.date})` : ''}`);
    const breaking = commits.filter((c) => c.breaking);
    if (breaking.length > 0) {
      lines.push('', '### Breaking changes', '');
      for (const c of breaking) lines.push(`- ${c.area}: ${c.text} (${c.hash})`);
    }
    const areas = [...new Set(commits.map((c) => c.area))].sort((a, b) =>
      a === 'other' ? 1 : b === 'other' ? -1 : a.localeCompare(b),
    );
    for (const area of areas) {
      lines.push('', `### ${area}`, '');
      for (const c of commits.filter((commit) => commit.area === area))
        lines.push(`- ${c.text} (${c.hash})`);
    }
  }
  return `${lines.join('\n')}\n`;
}

function git(cwd, args) {
  return execFileSync('git', args, { cwd, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
}

function commitsIn(cwd, range) {
  return git(cwd, ['log', '--no-merges', `--format=%H${FIELD}%s${FIELD}%b${RECORD}`, range])
    .split(RECORD)
    .map((record) => record.trim())
    .filter(Boolean)
    .map((record) => {
      const [hash, subject, body = ''] = record.split(FIELD);
      return { hash, subject, body };
    });
}

/** Releases of the repository at `cwd`, newest first. */
export function readReleases(cwd) {
  const tags = git(cwd, ['tag', '--list', 'v*', '--merged', 'HEAD', '--sort=-v:refname'])
    .split('\n')
    .filter(Boolean);
  const releases = [
    { name: 'Unreleased', commits: commitsIn(cwd, tags[0] ? `${tags[0]}..HEAD` : 'HEAD') },
  ];
  tags.forEach((tag, i) => {
    const previous = tags[i + 1];
    releases.push({
      name: tag.slice(1),
      date: git(cwd, ['log', '-1', '--format=%as', tag]).trim(),
      commits: commitsIn(cwd, previous ? `${previous}..${tag}` : tag),
    });
  });
  return releases;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const root = join(fileURLToPath(new URL('.', import.meta.url)), '..');
  const file = join(root, 'CHANGELOG.md');
  writeFileSync(file, renderChangelog(readReleases(root)));
  console.log(`Wrote ${file}`);
}
