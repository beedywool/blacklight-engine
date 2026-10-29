import { join } from 'node:path';
import * as vscode from 'vscode';
import { DebugClient, readDevServer, type DevServerInfo } from './core/debug-client';
import { resolveLaunch, type BlacklightLaunch } from './core/launch';
import { listObjects } from './core/project';
import { gameRoot, guarded } from './game';

/** Connection to the games of the running dev server (one at a time). */
export class LiveGame implements vscode.Disposable {
  client: DebugClient | undefined;
  info: DevServerInfo | undefined;
  root: string | undefined;
  private readonly changed = new vscode.EventEmitter<void>();
  /** Fires when the connection opens or closes. */
  readonly onDidChange = this.changed.event;

  get connected(): boolean {
    return !!this.client && !this.client.closed;
  }

  /**
   * Connects to the dev server of the game containing `uri` (reuses the connection when it is
   * the same server).
   *
   * @throws Error when no dev server runs.
   */
  async connect(uri?: vscode.Uri): Promise<DebugClient> {
    const root = gameRoot(uri);
    const info = readDevServer(root);
    if (!info)
      throw new Error(
        'The game is not running: start it with `blacklight dev` (or `pnpm dev`) and open it in a browser.',
      );
    if (
      this.client &&
      !this.client.closed &&
      this.info?.port === info.port &&
      this.info.token === info.token
    )
      return this.client;
    this.client?.close();
    this.client = await DebugClient.connect(info);
    this.info = info;
    this.root = root;
    this.client.onEvent(() => this.changed.fire());
    this.changed.fire();
    return this.client;
  }

  disconnect(): void {
    this.client?.close();
    this.client = undefined;
    this.changed.fire();
  }

  dispose(): void {
    this.disconnect();
    this.changed.dispose();
  }
}

/** A node of the Live Objects view. */
export type LiveNode =
  | { kind: 'message'; text: string }
  | { kind: 'scene'; name: string; objects: ObjectSummary[] }
  | { kind: 'object'; object: ObjectSummary }
  | { kind: 'variable'; object: ObjectSummary; path: string; value: unknown };

export interface ObjectSummary {
  id: number;
  type: string;
  scene: string;
  x: number;
  y: number;
  layer?: string;
  tags: string[];
}

interface Inspected {
  core: Record<string, unknown>;
  data: Record<string, unknown>;
  state: Record<string, unknown>;
  behaviors: { enabled: boolean; data: Record<string, unknown> }[];
  animation?: Record<string, unknown>;
}

/** Display text of a snapshot value (`{ $ref: 3 }` is object #3). */
export function showValue(value: unknown): string {
  if (value && typeof value === 'object') {
    const record = value as Record<string, unknown>;
    if ('$ref' in record) return `→ #${String(record.$ref)}`;
    if ('$v' in record) return `(${(record.$v as number[]).join(', ')})`;
    if ('$undefined' in record) return 'undefined';
  }
  return JSON.stringify(value);
}

/** Variables of an object, as `path → value` (`core.x`, `hp`, `behaviors.0.speed`). */
export function variables(inspected: Inspected): { path: string; value: unknown }[] {
  const out: { path: string; value: unknown }[] = [];
  for (const [key, value] of Object.entries(inspected.data)) out.push({ path: key, value });
  for (const key of [
    'x',
    'y',
    'vx',
    'vy',
    'rotation',
    'scaleX',
    'scaleY',
    'alpha',
    'visible',
    'zIndex',
    'player',
    'tags',
  ])
    if (key in inspected.core) out.push({ path: `core.${key}`, value: inspected.core[key] });
  inspected.behaviors.forEach((b, i) => {
    out.push({ path: `behaviors.${i}.enabled`, value: b.enabled });
    for (const [key, value] of Object.entries(b.data))
      out.push({ path: `behaviors.${i}.${key}`, value });
  });
  for (const [key, value] of Object.entries(inspected.animation ?? {}))
    out.push({ path: `animation.${key}`, value });
  return out;
}

/** The Live Objects view: scenes, their objects and each object's variables. */
export class ObjectsTree implements vscode.TreeDataProvider<LiveNode>, vscode.Disposable {
  private readonly changed = new vscode.EventEmitter<LiveNode | undefined>();
  readonly onDidChangeTreeData = this.changed.event;
  private timer: ReturnType<typeof setInterval> | undefined;

  constructor(private readonly live: LiveGame) {
    live.onDidChange(() => this.refresh());
  }

  refresh(): void {
    this.changed.fire(undefined);
  }

  /** Refreshes every second while `visible` (the view is shown). */
  poll(visible: boolean): void {
    clearInterval(this.timer);
    this.timer = visible ? setInterval(() => this.refresh(), 1000) : undefined;
  }

  getTreeItem(node: LiveNode): vscode.TreeItem {
    switch (node.kind) {
      case 'message': {
        const item = new vscode.TreeItem(node.text);
        item.iconPath = new vscode.ThemeIcon('info');
        return item;
      }
      case 'scene': {
        const item = new vscode.TreeItem(node.name, vscode.TreeItemCollapsibleState.Expanded);
        item.description = `${node.objects.length} objects`;
        item.iconPath = new vscode.ThemeIcon('symbol-namespace');
        item.id = `scene:${node.name}`;
        return item;
      }
      case 'object': {
        const o = node.object;
        const item = new vscode.TreeItem(
          `${o.type} #${o.id}`,
          vscode.TreeItemCollapsibleState.Collapsed,
        );
        item.description = `${o.x}, ${o.y}${o.tags.length ? ` · ${o.tags.join(' ')}` : ''}`;
        item.iconPath = new vscode.ThemeIcon('symbol-class');
        item.contextValue = 'object';
        item.id = `object:${o.scene}:${o.id}`;
        return item;
      }
      case 'variable': {
        const item = new vscode.TreeItem(node.path);
        item.description = showValue(node.value);
        item.tooltip = `${node.path} = ${JSON.stringify(node.value)}`;
        item.iconPath = new vscode.ThemeIcon('symbol-variable');
        item.contextValue = 'variable';
        item.command = {
          command: 'blacklight.editVariable',
          title: 'Edit Value',
          arguments: [node],
        };
        return item;
      }
    }
  }

  async getChildren(node?: LiveNode): Promise<LiveNode[]> {
    if (!node) {
      let client: DebugClient;
      try {
        client = await this.live.connect();
      } catch (error) {
        return [{ kind: 'message', text: (error as Error).message }];
      }
      try {
        const { objects } = await client.request<{ objects: ObjectSummary[] }>('objects');
        const scenes = [...new Set(objects.map((o) => o.scene))];
        return scenes.map((name) => ({
          kind: 'scene',
          name,
          objects: objects.filter((o) => o.scene === name),
        }));
      } catch (error) {
        return [{ kind: 'message', text: (error as Error).message }];
      }
    }
    if (node.kind === 'scene') return node.objects.map((object) => ({ kind: 'object', object }));
    if (node.kind === 'object') {
      const client = await this.live.connect();
      const inspected = await client.request<Inspected>('inspect', {
        id: node.object.id,
        scene: node.object.scene,
      });
      return variables(inspected).map((v) => ({ kind: 'variable', object: node.object, ...v }));
    }
    return [];
  }

  dispose(): void {
    clearInterval(this.timer);
    this.changed.dispose();
  }
}

/** Resolves `blacklight` launch configurations to browser debug sessions. */
export class LaunchProvider implements vscode.DebugConfigurationProvider {
  resolveDebugConfigurationWithSubstitutedVariables(
    folder: vscode.WorkspaceFolder | undefined,
    config: vscode.DebugConfiguration,
  ): vscode.DebugConfiguration | undefined {
    const launch = { ...config, type: 'blacklight', request: 'launch' } as BlacklightLaunch;
    const root = gameRoot(launch.root ? vscode.Uri.file(launch.root) : folder?.uri);
    try {
      return resolveLaunch(launch, root, readDevServer(root)) as vscode.DebugConfiguration;
    } catch (error) {
      void vscode.window.showErrorMessage((error as Error).message);
      return undefined;
    }
  }
}

/** The view, the debugger and the live commands. */
export function registerLive(
  context: vscode.ExtensionContext,
  live: LiveGame,
): { tree: ObjectsTree; launch: LaunchProvider } {
  const tree = new ObjectsTree(live);
  const launch = new LaunchProvider();
  const view = vscode.window.createTreeView('blacklight.objects', {
    treeDataProvider: tree,
    showCollapseAll: true,
  });
  tree.poll(view.visible);
  const call = (method: string, params?: Record<string, unknown>) =>
    guarded(async () => {
      const client = await live.connect();
      const result = await client.request(method, params);
      tree.refresh();
      return result;
    });
  context.subscriptions.push(
    live,
    tree,
    view,
    view.onDidChangeVisibility((e) => tree.poll(e.visible)),
    vscode.debug.registerDebugConfigurationProvider('blacklight', launch),
    vscode.commands.registerCommand('blacklight.refreshObjects', () => tree.refresh()),
    vscode.commands.registerCommand('blacklight.pauseGame', call('pause')),
    vscode.commands.registerCommand('blacklight.resumeGame', call('resume')),
    vscode.commands.registerCommand('blacklight.stepGame', call('step', { count: 1 })),
    vscode.commands.registerCommand(
      'blacklight.editVariable',
      guarded(async (node: Extract<LiveNode, { kind: 'variable' }>, value?: unknown) => {
        let next = value;
        if (next === undefined) {
          const input = await vscode.window.showInputBox({
            prompt: `New value of ${node.object.type} #${node.object.id} ${node.path} (JSON)`,
            value: JSON.stringify(node.value),
            validateInput: (text) => {
              try {
                JSON.parse(text);
                return undefined;
              } catch {
                return 'Type a JSON value: 12, true, "text", [1, 2]';
              }
            },
          });
          if (input === undefined) return undefined;
          next = JSON.parse(input);
        }
        const client = await live.connect();
        const result = await client.request('set', {
          id: node.object.id,
          scene: node.object.scene,
          path: node.path,
          value: next,
        });
        tree.refresh();
        return result;
      }),
    ),
    vscode.commands.registerCommand(
      'blacklight.revealObject',
      guarded(async (node: Extract<LiveNode, { kind: 'object' }>) => {
        const root = live.root ?? gameRoot();
        const info = listObjects(root).find(
          (o) => o.name === node.object.type && (!o.scene || o.scene === node.object.scene),
        );
        if (!info)
          throw new Error(`${node.object.type} is an engine class; it has no file in the game.`);
        await vscode.window.showTextDocument(vscode.Uri.file(join(root, info.file)));
      }),
    ),
    vscode.commands.registerCommand(
      'blacklight.debugGame',
      guarded(async (uri?: vscode.Uri) => {
        const root = gameRoot(uri);
        const folder = vscode.workspace.getWorkspaceFolder(vscode.Uri.file(root));
        return vscode.debug.startDebugging(folder, {
          type: 'blacklight',
          request: 'launch',
          name: 'Debug game',
          root,
        });
      }),
    ),
  );
  return { tree, launch };
}
