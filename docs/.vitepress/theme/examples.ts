// Example sources: the same .ts files `pnpm typecheck` checks, read raw at build time.
import { withBase } from 'vitepress';
import type { ProjectFiles } from '../../runner/protocol';

const sources = import.meta.glob(
  [
    '../../examples/**/*.{ts,json}',
    '!../../examples/getting-started/**',
    '!../../examples/**/tsconfig.json',
  ],
  { query: '?raw', import: 'default' },
) as Record<string, () => Promise<string>>;
const binaries = import.meta.glob(
  ['../../examples/**/*.{png,wav,webm,mp4,vtt}', '!../../examples/getting-started/**'],
  {
    query: '?url',
    import: 'default',
    eager: true,
  },
) as Record<string, string>;

const ROOT = '../../examples/';

/** Files every example can use: `assets/…` (shared images). */
function sharedAssets(): ProjectFiles {
  const files: ProjectFiles = {};
  for (const [key, url] of Object.entries(binaries))
    if (key.startsWith(`${ROOT}assets/`)) files[key.slice(ROOT.length)] = absolute(url);
  return files;
}

/** Asset URLs are site-relative; the runner page lives elsewhere, so make them absolute. */
function absolute(url: string): string {
  if (typeof location === 'undefined' || /^(data:|blob:|https?:)/.test(url)) return url;
  return new URL(url.startsWith('/') ? url : withBase(url), location.href).pathname;
}

/**
 * Files of an example: `<src>.ts` alone (as `main.ts`), or every file of the folder `<src>/`
 * (its `main.ts` is the scene). Shared assets are added in both cases.
 */
export async function loadExample(
  src: string,
): Promise<{ files: ProjectFiles; editable: string[] }> {
  const files: ProjectFiles = {};
  const editable: string[] = [];
  const single = sources[`${ROOT}${src}.ts`];
  if (single) {
    files['main.ts'] = await single();
    editable.push('main.ts');
  } else {
    const prefix = `${ROOT}${src}/`;
    for (const [key, load] of Object.entries(sources)) {
      if (!key.startsWith(prefix)) continue;
      const path = key.slice(prefix.length);
      files[path] = await load();
      editable.push(path);
    }
    for (const [key, url] of Object.entries(binaries))
      if (key.startsWith(prefix)) files[key.slice(prefix.length)] = absolute(url);
    editable.sort((a, b) => (a === 'main.ts' ? -1 : b === 'main.ts' ? 1 : a.localeCompare(b)));
  }
  if (!editable.length) throw new Error(`No example "${src}" in docs/examples/.`);
  return { files: { ...sharedAssets(), ...files }, editable };
}

/**
 * The playground's starting project: every file of `docs/examples/playground/`, paths relative to
 * it (`game.config.ts`, `scenes/…`). Images are URLs on this site.
 */
export async function loadPlaygroundProject(): Promise<ProjectFiles> {
  const prefix = `${ROOT}playground/`;
  const files: ProjectFiles = {};
  for (const [key, load] of Object.entries(sources))
    if (key.startsWith(prefix)) files[key.slice(prefix.length)] = await load();
  for (const [key, url] of Object.entries(binaries))
    if (key.startsWith(prefix)) files[key.slice(prefix.length)] = absolute(url);
  return files;
}
