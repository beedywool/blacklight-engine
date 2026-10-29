import { randomBytes } from 'node:crypto';
import { existsSync } from 'node:fs';
import { basename, join } from 'node:path';
import * as ts from 'typescript';
import * as vscode from 'vscode';
import { assetReport, type AssetReport } from './core/assets';
import {
  CONFIG_FIELDS,
  readConfig,
  setConfigValue,
  type ConfigField,
  type ConfigState,
  type ConfigValue,
} from './core/config';
import { readDevServer } from './core/debug-client';
import { CONFIG_FILES, IMAGE_EXTENSIONS, extension, listScenes } from './core/project';
import { gameRoot } from './game';
import type { LiveGame } from './live';
import { Controller, replaceDocument, type WebviewMessage } from './panel';

// ---------------------------------------------------------------- UI component preview

export interface UiPreviewState {
  file: string;
  screen: string;
  /** Page the preview frame shows: the dev server with this preview's client id. */
  url?: string;
  clientId: string;
  /** The game in the frame said hello and opened the screen. */
  ready: boolean;
  focusables: { index: number; label: string; focused: boolean }[];
  error?: string;
}

/**
 * Live preview of a Vue screen: the running game (dev server) in a frame, the screen opened over
 * it through the debug channel, and its focus states listed so each can be shown. Saving the
 * `.vue` file updates the frame through Vue hot reload.
 */
export class UiPreviewController extends Controller<UiPreviewState> {
  readonly kind = 'ui-preview';
  readonly clientId = `preview-${randomBytes(4).toString('hex')}`;
  readonly screen: string;
  url: string | undefined;
  ready = false;
  focusables: UiPreviewState['focusables'] = [];
  error: string | undefined;

  constructor(
    readonly file: vscode.Uri,
    private readonly live: LiveGame,
  ) {
    super();
    this.screen = basename(file.fsPath, '.vue');
  }

  /** Connects to the dev server and waits for the frame's game. */
  async start(): Promise<void> {
    const root = gameRoot(this.file);
    const info = readDevServer(root);
    if (!info) {
      this.error =
        'Start the dev server (`blacklight dev`) to preview screens: the preview runs the real game.';
      await this.push();
      return;
    }
    const external = await vscode.env.asExternalUri(vscode.Uri.parse(info.url));
    const page = new URL(external.toString(true));
    page.searchParams.set('blacklight-client', this.clientId);
    this.url = page.toString();
    const client = await this.live.connect(this.file);
    this.disposables.push({
      dispose: client.onEvent((event) => {
        if (event.client === this.clientId && event.type === 'hello') void this.open();
      }),
    });
    await this.push();
  }

  /** Opens the screen in the frame's game and lists its focusable elements. */
  async open(): Promise<void> {
    try {
      const client = await this.live.connect(this.file);
      await client.request('ui.open', { screen: this.screen }, { target: this.clientId });
      // Let the screen mount and its enter transition start before reading the focus targets.
      await new Promise((resolve) => setTimeout(resolve, 300));
      await this.refreshFocus();
      this.ready = true;
      this.error = undefined;
      await this.push();
    } catch (error) {
      this.error = (error as Error).message;
      await this.push();
    }
  }

  private async refreshFocus(): Promise<void> {
    const client = await this.live.connect(this.file);
    this.focusables = await client.request('ui.focusables', {}, { target: this.clientId });
  }

  state(): UiPreviewState {
    return {
      file: vscode.workspace.asRelativePath(this.file),
      screen: this.screen,
      ...(this.url && { url: this.url }),
      clientId: this.clientId,
      ready: this.ready,
      focusables: this.focusables,
      ...(this.error && { error: this.error }),
    };
  }

  protected async handle(message: WebviewMessage): Promise<unknown> {
    const client = await this.live.connect(this.file);
    switch (message.type) {
      case 'focus': {
        const result = await client.request(
          'ui.focus',
          { index: Number(message.index) },
          { target: this.clientId },
        );
        await this.refreshFocus();
        return result;
      }
      case 'refresh':
        await this.refreshFocus();
        return this.focusables.length;
      case 'reopen':
        await this.open();
        return this.ready;
      default:
        throw new Error(`Unknown message ${message.type}`);
    }
  }
}

// ---------------------------------------------------------------- game.config.ts form

export interface ConfigFormState extends ConfigState {
  file: string;
  fields: ConfigField[];
  scenes: string[];
}

/** Form over `game.config.ts`; every change is a minimal edit of the TypeScript source. */
export class ConfigController extends Controller<ConfigFormState> {
  readonly kind = 'config';

  constructor(
    readonly document: vscode.TextDocument,
    private readonly root: string,
  ) {
    super();
    this.disposables.push(
      vscode.workspace.onDidChangeTextDocument((event) => {
        if (event.document === document) void this.push();
      }),
    );
  }

  state(): ConfigFormState {
    return {
      file: vscode.workspace.asRelativePath(this.document.uri),
      fields: CONFIG_FIELDS,
      scenes: listScenes(this.root),
      ...readConfig(ts, this.document.getText()),
    };
  }

  protected async handle(message: WebviewMessage): Promise<unknown> {
    if (message.type !== 'set') throw new Error(`Unknown message ${message.type}`);
    const path = String(message.path);
    const field = CONFIG_FIELDS.find((f) => f.path === path);
    if (!field) throw new Error(`"${path}" is not a field of the form.`);
    const value = message.value as ConfigValue | undefined;
    if (value === undefined && field.required) throw new Error(`${field.label} is required.`);
    await replaceDocument(this.document, setConfigValue(ts, this.document.getText(), path, value));
    // Saved at once: the dev server reloads the game with the new configuration.
    await this.document.save();
    return path;
  }
}

/** Opens `game.config.ts` of the game for the form. */
export async function configDocument(
  uri?: vscode.Uri,
): Promise<{ root: string; document: vscode.TextDocument }> {
  const root = gameRoot(uri);
  const file = CONFIG_FILES.map((f) => join(root, f)).find(existsSync)!;
  return { root, document: await vscode.workspace.openTextDocument(file) };
}

// ---------------------------------------------------------------- asset browser

export interface AssetBrowserState extends AssetReport {
  root: string;
  /** Webview URLs of image thumbnails, by asset path. */
  thumbnails: Record<string, string>;
}

/** Asset browser: thumbnails, unused files, preload weight of each scene. */
export class AssetsController extends Controller<AssetBrowserState> {
  readonly kind = 'assets';

  constructor(readonly root: string) {
    super();
    const watcher = vscode.workspace.createFileSystemWatcher(
      new vscode.RelativePattern(
        root,
        '{assets,scenes,objects,ui,models,stories,animations,locales}/**',
      ),
    );
    let timer: ReturnType<typeof setTimeout> | undefined;
    const later = () => {
      clearTimeout(timer);
      timer = setTimeout(() => void this.push(), 300);
    };
    this.disposables.push(
      watcher,
      watcher.onDidCreate(later),
      watcher.onDidDelete(later),
      watcher.onDidChange(later),
    );
  }

  state(): AssetBrowserState {
    const report = assetReport(this.root);
    const thumbnails: Record<string, string> = {};
    for (const asset of report.assets)
      if (IMAGE_EXTENSIONS.has(extension(asset.path)))
        thumbnails[asset.path] = this.uri(vscode.Uri.file(join(this.root, asset.path)));
    return { root: this.root, ...report, thumbnails };
  }

  protected async handle(message: WebviewMessage): Promise<unknown> {
    const uri = vscode.Uri.file(join(this.root, String(message.path ?? '')));
    switch (message.type) {
      case 'open':
        await vscode.commands.executeCommand('vscode.open', uri);
        return undefined;
      case 'reveal':
        await vscode.commands.executeCommand('revealInExplorer', uri);
        return undefined;
      case 'refresh':
        return undefined;
      default:
        throw new Error(`Unknown message ${message.type}`);
    }
  }
}
