import { rmSync, writeFileSync } from 'node:fs';
import { join, relative, sep } from 'node:path';
import MagicString from 'magic-string';
import type { Plugin, ViteDevServer } from 'vite';

/** Custom HMR event of the debug channel (same name as `DEBUG_EVENT` in `@blacklight/core/debug`). */
export const DEBUG_EVENT = 'blacklight:debug';

/** File the dev server writes in `.blacklight/` so tools (the VS Code extension) can find it. */
export const DEV_SERVER_FILE = 'dev-server.json';

/** Content of `.blacklight/dev-server.json`. */
export interface DevServerInfo {
  /** Page URL of the game. */
  url: string;
  port: number;
  /** Token the dev server's WebSocket expects from browser-like clients (`?token=`). */
  token: string;
  pid: number;
}

/** What the HMR code tells the game when a module changes; mirrors `HotUpdate` in core. */
export interface HotTarget {
  kind: 'scene' | 'object';
  name: string;
  path: string;
  scene?: string;
}

const pascal = (folder: string) =>
  folder
    .split(/[-_\s]+/)
    .filter(Boolean)
    .map((p) => p[0]!.toUpperCase() + p.slice(1))
    .join('');

/** Scene or object module that hot reload handles, from its project path. */
export function hotTarget(path: string): HotTarget | undefined {
  const scene = /^scenes\/([^/]+)\/([^/]+)\.scene\.[cm]?[jt]s$/.exec(path);
  if (scene && scene[1] === scene[2])
    return { kind: 'scene', name: scene[1]!, path: `scenes/${scene[1]}` };
  const local = /^scenes\/([^/]+)\/objects\/([^/]+)\/([^/]+)\.object\.[cm]?[jt]s$/.exec(path);
  if (local && local[2] === local[3])
    return {
      kind: 'object',
      name: pascal(local[2]!),
      path: `scenes/${local[1]}/objects/${local[2]}`,
      scene: local[1]!,
    };
  const global = /^objects\/([^/]+)\/([^/]+)\.object\.[cm]?[jt]s$/.exec(path);
  if (global && global[1] === global[2])
    return { kind: 'object', name: pascal(global[1]!), path: `objects/${global[1]}` };
  return undefined;
}

/**
 * Code appended to scene and object modules in dev: the module accepts its own updates and hands
 * the new version to the game (`installHotReload` in `@blacklight/core/debug`). Without a running
 * game, or when the game cannot apply it, the page reloads.
 */
export function hotCode(target: HotTarget): string {
  return `
if (import.meta.hot) {
  import.meta.hot.accept((next) => {
    const apply = globalThis.__blacklightHot;
    if (!next || !apply) return import.meta.hot.invalidate();
    apply({ ...${JSON.stringify(target)}, module: next }).then(
      (result) => result === 'reload' && import.meta.hot.invalidate(),
      (error) => {
        console.error('[blacklight] hot reload failed, reloading the page:', error);
        import.meta.hot.invalidate();
      },
    );
  });
}
`;
}

/** Relays debug messages between the game and tools, and writes `.blacklight/dev-server.json`. */
function serveTools(server: ViteDevServer, root: string, generated: string): void {
  // Every message goes to every client: games answer requests, tools read responses and events.
  server.ws.on(DEBUG_EVENT, (data: unknown) => server.ws.send(DEBUG_EVENT, data));
  const file = join(root, generated, DEV_SERVER_FILE);
  server.httpServer?.once('listening', () => {
    const address = server.httpServer!.address();
    if (!address || typeof address === 'string') return;
    const url = server.resolvedUrls?.local[0] ?? `http://localhost:${address.port}/`;
    const info: DevServerInfo = {
      url,
      port: address.port,
      token: server.config.webSocketToken,
      pid: process.pid,
    };
    writeFileSync(file, `${JSON.stringify(info, null, 2)}\n`);
  });
  server.httpServer?.once('close', () => rmSync(file, { force: true }));
}

/** Dev-only plugin: hot reload of scenes and objects (TL-02) and the debug channel (TL-03). */
export function blacklightTooling(options: { root: string; generated: string }): Plugin {
  return {
    name: 'blacklight:tooling',
    apply: 'serve',
    configureServer(server) {
      serveTools(server, options.root, options.generated);
    },
    transform(code, id) {
      const path = relative(options.root, id.split('?')[0]!).split(sep).join('/');
      const target = hotTarget(path);
      if (!target) return undefined;
      const s = new MagicString(code);
      s.append(hotCode(target));
      return { code: s.toString(), map: s.generateMap({ hires: 'boundary' }) };
    },
  };
}
