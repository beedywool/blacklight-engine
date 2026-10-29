import { join } from 'node:path';
import type { DevServerInfo } from './debug-client';

/** The `blacklight` debug configuration in `launch.json`. */
export interface BlacklightLaunch {
  type: 'blacklight';
  request: 'launch';
  name?: string;
  root?: string;
  url?: string;
  browser?: 'chrome' | 'msedge';
}

/**
 * Turns a `blacklight` launch configuration into a browser debug session of VS Code's built-in
 * JavaScript debugger, pointed at the game's dev server. Vite serves game files outside its root
 * (`.blacklight/`) under `/@fs/<absolute path>`, which `pathMapping` maps back to disk.
 *
 * @throws Error when no URL is given and no dev server runs.
 */
export function resolveLaunch(
  config: BlacklightLaunch,
  root: string,
  info: DevServerInfo | undefined,
): Record<string, unknown> {
  const url = config.url ?? info?.url;
  if (!url)
    throw new Error(
      'No dev server is running for this game. Start it with `blacklight dev` (or `pnpm dev`), then start debugging again.',
    );
  return {
    type: config.browser === 'msedge' ? 'msedge' : 'chrome',
    request: 'launch',
    name: config.name ?? 'Debug game',
    url,
    webRoot: join(root, '.blacklight'),
    pathMapping: { '/@fs/': '/' },
    sourceMaps: true,
    resolveSourceMapLocations: [`${root}/**`, '!**/node_modules/**'],
    skipFiles: ['**/node_modules/**', '<node_internals>/**'],
  };
}
