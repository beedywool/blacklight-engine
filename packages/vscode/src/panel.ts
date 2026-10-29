import { randomBytes } from 'node:crypto';
import * as vscode from 'vscode';

/** Messages a webview sends: `ready` once loaded, then feature-specific ones. */
export interface WebviewMessage {
  type: string;
  [key: string]: unknown;
}

/**
 * The extension side of one webview: it owns the state, applies the messages the page sends and
 * pushes new state. Tests drive it with {@link Controller.receive} like the page does.
 */
export abstract class Controller<S = unknown> {
  abstract readonly kind: string;
  private webview: vscode.Webview | undefined;
  protected readonly disposables: vscode.Disposable[] = [];
  /** Result of the last message, for tests and for the page (`{ type: 'result' }`). */
  lastResult: unknown;
  disposed = false;

  /** Current state, as sent to the page. */
  abstract state(): S | Promise<S>;

  /** Handles one message from the page. */
  protected abstract handle(message: WebviewMessage): Promise<unknown> | unknown;

  /** Connects a webview (panel or custom editor) to this controller. */
  attach(webview: vscode.Webview, onDispose: vscode.Event<void>): void {
    this.webview = webview;
    this.disposables.push(
      webview.onDidReceiveMessage((message: WebviewMessage) => void this.receive(message)),
    );
    onDispose(() => this.dispose());
  }

  /** Applies a message as if the page had sent it; resolves with the handler's result. */
  async receive(message: WebviewMessage): Promise<unknown> {
    try {
      const result = message.type === 'ready' ? undefined : await this.handle(message);
      this.lastResult = result;
      await this.push();
      if (result !== undefined) void this.webview?.postMessage({ type: 'result', result });
      return result;
    } catch (error) {
      const text = error instanceof Error ? error.message : String(error);
      void this.webview?.postMessage({ type: 'error', message: text });
      throw error;
    }
  }

  /** Sends the current state to the page. */
  async push(): Promise<void> {
    if (!this.webview || this.disposed) return;
    void this.webview.postMessage({ type: 'state', state: await this.state() });
  }

  /** Turns a file into a URL the page can load. */
  protected uri(file: vscode.Uri): string {
    return this.webview ? this.webview.asWebviewUri(file).toString() : file.toString();
  }

  dispose(): void {
    this.disposed = true;
    for (const d of this.disposables.splice(0)) d.dispose();
    registry.forget(this);
  }
}

/** Live controllers by kind, newest last; the extension API exposes it to tests. */
export class ControllerRegistry {
  private readonly items: Controller[] = [];

  add<C extends Controller>(controller: C): C {
    this.items.push(controller);
    return controller;
  }

  forget(controller: Controller): void {
    const index = this.items.indexOf(controller);
    if (index >= 0) this.items.splice(index, 1);
  }

  /** The newest controller of a kind (`animation`, `scene`, `timeline`, `slicer`, `ui-preview`, `config`, `assets`). */
  latest<C extends Controller = Controller>(kind: string): C | undefined {
    return this.items.filter((c) => c.kind === kind).at(-1) as C | undefined;
  }

  all(): readonly Controller[] {
    return this.items;
  }
}

export const registry = new ControllerRegistry();

/**
 * HTML of a page: the shared BlackLight stylesheet and the page's bundled script, under a strict
 * content security policy. `frames` allows embedding the game's dev server.
 */
export function pageHtml(
  webview: vscode.Webview,
  extension: vscode.Uri,
  page: string,
  title: string,
  options: { frames?: string[] } = {},
): string {
  const nonce = randomBytes(16).toString('base64');
  const media = (file: string) =>
    webview.asWebviewUri(vscode.Uri.joinPath(extension, ...file.split('/')));
  const csp = [
    "default-src 'none'",
    `img-src ${webview.cspSource} data: blob:`,
    `style-src ${webview.cspSource} 'unsafe-inline'`,
    `font-src ${webview.cspSource}`,
    `script-src 'nonce-${nonce}'`,
    ...(options.frames?.length ? [`frame-src ${options.frames.join(' ')}`] : []),
  ].join('; ');
  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta http-equiv="Content-Security-Policy" content="${csp}" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>${title}</title>
    <link rel="stylesheet" href="${media('media/webview.css')}" />
  </head>
  <body data-page="${page}">
    <div id="app"></div>
    <script nonce="${nonce}" src="${media(`dist-webview/${page}.js`)}"></script>
  </body>
</html>`;
}

/** Opens a webview panel for a controller. */
export function openPanel(
  extension: vscode.Uri,
  controller: Controller,
  viewType: string,
  title: string,
  options: { frames?: string[]; column?: vscode.ViewColumn; roots?: vscode.Uri[] } = {},
): vscode.WebviewPanel {
  const panel = vscode.window.createWebviewPanel(
    viewType,
    title,
    options.column ?? vscode.ViewColumn.Active,
    {
      enableScripts: true,
      retainContextWhenHidden: true,
      localResourceRoots: [
        extension,
        ...(options.roots ?? vscode.workspace.workspaceFolders?.map((f) => f.uri) ?? []),
      ],
    },
  );
  panel.iconPath = vscode.Uri.joinPath(extension, 'media', 'bulb.svg');
  setupWebview(panel.webview, extension, controller, controller.kind, title, options);
  controller.attach(panel.webview, panel.onDidDispose);
  registry.add(controller);
  return panel;
}

/** Shared setup of panels and custom editors. */
export function setupWebview(
  webview: vscode.Webview,
  extension: vscode.Uri,
  _controller: Controller,
  page: string,
  title: string,
  options: { frames?: string[]; roots?: vscode.Uri[] } = {},
): void {
  webview.options = {
    enableScripts: true,
    localResourceRoots: [
      extension,
      ...(options.roots ?? vscode.workspace.workspaceFolders?.map((f) => f.uri) ?? []),
    ],
  };
  webview.html = pageHtml(webview, extension, page, title, options);
}

/** Replaces a text document's whole content (one undo step). */
export async function replaceDocument(document: vscode.TextDocument, text: string): Promise<void> {
  if (document.getText() === text) return;
  const edit = new vscode.WorkspaceEdit();
  edit.replace(document.uri, new vscode.Range(0, 0, document.lineCount, 0), text);
  if (!(await vscode.workspace.applyEdit(edit)))
    throw new Error(
      `VS Code refused to edit ${vscode.workspace.asRelativePath(document.uri)}; it may be read-only.`,
    );
}
