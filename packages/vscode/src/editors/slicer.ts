import { existsSync, readFileSync } from 'node:fs';
import { basename, dirname, join, relative, sep } from 'node:path';
import * as vscode from 'vscode';
import type { GridSpec } from '../core/engine';
import { findGameRoot } from '../core/project';
import {
  animFileFor,
  gridFileName,
  guessGrid,
  pngSize,
  slice,
  type Slice,
  type SlicedAnimations,
} from '../core/sheet';
import { Controller, registry, setupWebview, type WebviewMessage } from '../panel';

export interface SlicerState {
  file: string;
  imageUrl: string;
  width: number;
  height: number;
  slice: Slice;
  /** File name the grid gives (`hero@16x16.png`). */
  gridName: string;
  /** `.anim.json` of the folder, when it exists. */
  animFile?: string;
}

/** What "Save" did. */
export interface SliceResult {
  image: string;
  animFile?: string;
}

/** Sprite-sheet slicer: choose the frame grid, preview frames, name animations, save. */
export class SlicerController extends Controller<SlicerState> {
  readonly kind = 'slicer';
  private spec: GridSpec;
  private readonly size: { width: number; height: number };

  constructor(public image: vscode.Uri) {
    super();
    const size = pngSize(readFileSync(image.fsPath));
    if (!size) throw new Error(`${basename(image.fsPath)} is not a PNG image.`);
    this.size = size;
    this.spec = guessGrid(basename(image.fsPath), size.width, size.height);
  }

  private get animPath(): string {
    const folder = dirname(this.image.fsPath);
    return join(folder, `${basename(folder)}.anim.json`);
  }

  state(): SlicerState {
    const file = basename(this.image.fsPath);
    return {
      file: vscode.workspace.asRelativePath(this.image),
      imageUrl: this.uri(this.image),
      ...this.size,
      slice: slice(this.spec, this.size.width, this.size.height),
      gridName: gridFileName(file, this.spec),
      ...(existsSync(this.animPath) && {
        animFile: vscode.workspace.asRelativePath(vscode.Uri.file(this.animPath)),
      }),
    };
  }

  protected async handle(message: WebviewMessage): Promise<unknown> {
    switch (message.type) {
      case 'grid': {
        const value = (key: string, min: number) =>
          Math.max(min, Math.floor(Number(message[key] ?? 0)));
        this.spec = {
          width: value('width', 1),
          height: value('height', 1),
          spacing: value('spacing', 0),
        };
        return slice(this.spec, this.size.width, this.size.height);
      }
      case 'save':
        return this.save(
          (message.animations as SlicedAnimations) ?? {},
          Number(message.fps ?? 10),
          message.rename !== false,
          message.overwrite === true,
        );
      default:
        throw new Error(`Unknown message ${message.type}`);
    }
  }

  /** Renames the image after its grid and writes the folder's `.anim.json`. */
  private async save(
    animations: SlicedAnimations,
    fps: number,
    rename: boolean,
    overwrite: boolean,
  ): Promise<SliceResult> {
    const folder = dirname(this.image.fsPath);
    let image = basename(this.image.fsPath);
    const target = gridFileName(image, this.spec);
    if (rename && target !== image) {
      const to = vscode.Uri.file(join(folder, target));
      await vscode.workspace.fs.rename(this.image, to, { overwrite: false });
      this.image = to;
      image = target;
    }
    if (Object.keys(animations).length === 0) return { image };
    if (existsSync(this.animPath) && !overwrite) {
      const answer = await vscode.window.showWarningMessage(
        `${basename(this.animPath)} exists. Replace its animations?`,
        { modal: true },
        'Replace',
      );
      if (answer !== 'Replace') return { image };
    }
    const root = findGameRoot(folder) ?? folder;
    const schema = `${relative(folder, join(root, 'node_modules/@blacklight/core/schema/anim.schema.json')).split(sep).join('/')}`;
    await vscode.workspace.fs.writeFile(
      vscode.Uri.file(this.animPath),
      new TextEncoder().encode(animFileFor(image, animations, fps, schema)),
    );
    return { image, animFile: basename(this.animPath) };
  }
}

/** Opens PNG files in the slicer ("Open With…" or "Slice Sprite Sheet"). */
export class SlicerEditorProvider implements vscode.CustomReadonlyEditorProvider {
  constructor(private readonly extension: vscode.Uri) {}

  openCustomDocument(uri: vscode.Uri): vscode.CustomDocument {
    return { uri, dispose: () => {} };
  }

  resolveCustomEditor(document: vscode.CustomDocument, panel: vscode.WebviewPanel): void {
    const controller = registry.add(new SlicerController(document.uri));
    setupWebview(panel.webview, this.extension, controller, 'slicer', 'Sprite sheet');
    controller.attach(panel.webview, panel.onDidDispose);
  }
}
