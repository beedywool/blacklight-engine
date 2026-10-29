import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { basename, dirname, join } from 'node:path';
import * as vscode from 'vscode';
import { animPreview, editAnimations, setAnimField, type AnimPreview } from '../core/anim';
import { pngSize } from '../core/sheet';
import { Controller, registry, replaceDocument, setupWebview, type WebviewMessage } from '../panel';

/** State of the `.anim.json` editor: the file's fields and what the preview plays. */
export interface AnimationState {
  file: string;
  /** The JSON as written (for the form). */
  json: Record<string, unknown> | undefined;
  preview: AnimPreview;
  /** Webview URL of the sheet image. */
  imageUrl?: string;
  /** Changes since the editor opened, to show the preview is live. */
  version: number;
}

/** Image size from the file header (PNG), else `undefined`. */
export function imageSize(file: string): { width: number; height: number } | undefined {
  try {
    return pngSize(readFileSync(file));
  } catch {
    return undefined;
  }
}

/** The `.anim.json` form with a live preview; edits rewrite the JSON document. */
export class AnimationController extends Controller<AnimationState> {
  readonly kind = 'animation';

  constructor(readonly document: vscode.TextDocument) {
    super();
    this.disposables.push(
      vscode.workspace.onDidChangeTextDocument((event) => {
        if (event.document === document) void this.push();
      }),
    );
  }

  state(): AnimationState {
    const folder = dirname(this.document.uri.fsPath);
    const text = this.document.getText();
    const preview = animPreview(text, {
      folder: basename(folder),
      files: existsSync(folder) ? readdirSync(folder) : [],
      imageSize: (file) => imageSize(join(folder, file)),
      readJson: (file) => JSON.parse(readFileSync(join(folder, file), 'utf8')),
    });
    let json: Record<string, unknown> | undefined;
    try {
      json = JSON.parse(text) as Record<string, unknown>;
    } catch {
      json = undefined;
    }
    return {
      file: vscode.workspace.asRelativePath(this.document.uri),
      json,
      preview,
      ...(preview.image && { imageUrl: this.uri(vscode.Uri.file(join(folder, preview.image))) }),
      version: this.document.version,
    };
  }

  protected async handle(message: WebviewMessage): Promise<unknown> {
    const text = this.document.getText();
    switch (message.type) {
      case 'set':
        await replaceDocument(
          this.document,
          setAnimField(
            text,
            message.animation as string | undefined,
            String(message.key),
            message.value,
          ),
        );
        return undefined;
      case 'add':
        await replaceDocument(this.document, editAnimations(text, { add: String(message.name) }));
        return undefined;
      case 'remove':
        await replaceDocument(
          this.document,
          editAnimations(text, { remove: String(message.name) }),
        );
        return undefined;
      case 'rename':
        await replaceDocument(
          this.document,
          editAnimations(text, { rename: { from: String(message.from), to: String(message.to) } }),
        );
        return undefined;
      case 'source':
        await vscode.window.showTextDocument(this.document, vscode.ViewColumn.Beside);
        return undefined;
      default:
        throw new Error(`Unknown message ${message.type}`);
    }
  }
}

/** Custom editor for `*.anim.json` (opened beside the text with "Open Animation Editor"). */
export class AnimationEditorProvider implements vscode.CustomTextEditorProvider {
  constructor(private readonly extension: vscode.Uri) {}

  resolveCustomTextEditor(document: vscode.TextDocument, panel: vscode.WebviewPanel): void {
    const controller = registry.add(new AnimationController(document));
    setupWebview(panel.webview, this.extension, controller, 'animation', 'Animation');
    controller.attach(panel.webview, panel.onDidDispose);
  }
}
