// DOC-08: deployment guides for web games, the docs site and playground, the registry index and
// the servers exist, are in the sidebar, give commands and say what they do not cover.
// `pnpm docs:build` fails on any dead link in them.
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const docs = join(import.meta.dirname, '..', 'docs');
const config = readFileSync(join(docs, '.vitepress', 'config.ts'), 'utf8');
const guides = {
  'deploy-web': ['manifest.webmanifest', 'sw.js'],
  'deploy-docs': ['pnpm docs:build', 'playground'],
  'deploy-registry': ['BLACKLIGHT_REGISTRY', 'v1/index.json'],
  'deploy-server': ['docker compose', 'SESSION_SECRET', 'BLACKLIGHT_RELAY_PORT', 'proxy'],
};

describe.each(Object.entries(guides))('%s', (page, mentions) => {
  const text = readFileSync(join(docs, 'guide', `${page}.md`), 'utf8');

  it('is in the Deployment sidebar group', () => {
    const group = config.slice(config.indexOf("text: 'Deployment'"));
    expect(group.slice(0, group.indexOf(']'))).toContain(`link: '/guide/${page}'`);
  });

  it('gives exact commands and a Limits section', () => {
    expect(text).toMatch(/```sh\n/);
    expect(text).toContain('\n## Limits\n');
    for (const mention of mentions) expect(text).toContain(mention);
  });

  it('follows the house style', () => {
    expect(text).not.toMatch(/\b(simply|just|seamless(ly)?|powerful|blazing)\b/i);
  });
});
