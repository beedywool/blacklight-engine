import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { basename, dirname, join } from 'node:path';
import * as ts from 'typescript';
import * as vscode from 'vscode';
import { animPreview } from '../core/anim';
import {
  applyLayoutEdit,
  configResolution,
  parseLayout,
  printLayout,
  sceneStatics,
  type Layout,
  type LayoutEdit,
} from '../core/layout';
import { CONFIG_FILES, findGameRoot, objectsForScene, type ObjectInfo } from '../core/project';
import { addLayoutLoad } from '../core/scene-code';
import { layoutFile } from '../core/templates';
import { Controller, registry, replaceDocument, setupWebview, type WebviewMessage } from '../panel';
import { imageSize } from './animation';

/** An object the editor can place, with what to draw for it. */
export interface PaletteEntry {
  name: string;
  folder: string;
  imageUrl?: string;
  /** Part of the image to draw (first frame of the default animation). */
  frame?: { x: number; y: number; width: number; height: number };
}

export interface SceneEditorState {
  file: string;
  scene: string;
  layout: Layout | undefined;
  error?: string;
  /** Design resolution from game.config.ts. */
  resolution: { width: number; height: number };
  /** World size (`static size`), else the resolution. */
  world: { width: number; height: number };
  layers: string[];
  palette: PaletteEntry[];
}

function paletteEntry(
  root: string,
  object: ObjectInfo,
  toUrl: (file: string) => string,
): PaletteEntry {
  const folder = join(root, object.folder);
  const entry: PaletteEntry = { name: object.name, folder: object.folder };
  if (object.anim) {
    const preview = animPreview(readFileSync(join(root, object.anim), 'utf8'), {
      folder: basename(folder),
      files: readdirSync(folder),
      imageSize: (file) => imageSize(join(folder, file)),
      readJson: (file) => JSON.parse(readFileSync(join(folder, file), 'utf8')),
    });
    const animation =
      preview.animations.find((a) => a.name === preview.default) ?? preview.animations[0];
    if (preview.image) entry.imageUrl = toUrl(join(folder, preview.image));
    if (animation?.frames[0]) entry.frame = animation.frames[0];
  } else if (object.image) {
    entry.imageUrl = toUrl(join(root, object.image));
  }
  return entry;
}

/** Visual scene editor: places objects in `<scene>.layout.json`. */
export class SceneEditorController extends Controller<SceneEditorState> {
  readonly kind = 'scene';
  readonly root: string;
  readonly scene: string;

  constructor(readonly document: vscode.TextDocument) {
    super();
    const root = findGameRoot(document.uri.fsPath);
    if (!root)
      throw new Error('This layout file is not inside a game (no game.config.ts above it).');
    this.root = root;
    this.scene = basename(document.uri.fsPath).replace(/\.layout\.json$/, '');
    this.disposables.push(
      vscode.workspace.onDidChangeTextDocument((event) => {
        if (event.document === document) void this.push();
      }),
    );
  }

  state(): SceneEditorState {
    let layout: Layout | undefined;
    let error: string | undefined;
    try {
      layout = parseLayout(this.document.getText());
    } catch (e) {
      error = (e as Error).message;
    }
    const config = CONFIG_FILES.map((f) => join(this.root, f)).find(existsSync);
    const resolution = (config && configResolution(readFileSync(config, 'utf8'))) || {
      width: 1920,
      height: 1080,
    };
    const sceneFile = ['ts', 'js']
      .map((e) => join(dirname(this.document.uri.fsPath), `${this.scene}.scene.${e}`))
      .find(existsSync);
    const statics = sceneStatics(sceneFile ? readFileSync(sceneFile, 'utf8') : '');
    return {
      file: vscode.workspace.asRelativePath(this.document.uri),
      scene: this.scene,
      layout,
      ...(error && { error }),
      resolution,
      world: statics.size ?? resolution,
      layers: statics.layers,
      palette: objectsForScene(this.root, this.scene).map((o) =>
        paletteEntry(this.root, o, (file) => this.uri(vscode.Uri.file(file))),
      ),
    };
  }

  protected async handle(message: WebviewMessage): Promise<unknown> {
    switch (message.type) {
      case 'edit': {
        const layout = applyLayoutEdit(
          parseLayout(this.document.getText()),
          message.edit as LayoutEdit,
        );
        await replaceDocument(this.document, printLayout(layout));
        return layout.objects.length;
      }
      case 'save':
        return this.document.save();
      default:
        throw new Error(`Unknown message ${message.type}`);
    }
  }
}

export class SceneEditorProvider implements vscode.CustomTextEditorProvider {
  constructor(private readonly extension: vscode.Uri) {}

  resolveCustomTextEditor(document: vscode.TextDocument, panel: vscode.WebviewPanel): void {
    const controller = registry.add(new SceneEditorController(document));
    setupWebview(panel.webview, this.extension, controller, 'scene', 'Scene');
    controller.attach(panel.webview, panel.onDidDispose);
  }
}

/**
 * Opens the scene editor for a scene (its `.scene.ts`, its `.layout.json` or its name). Creates
 * the layout file when missing and adds `this.load(layout)` to the scene's `create()`.
 */
export async function openSceneEditor(
  root: string,
  target: vscode.Uri | string,
): Promise<vscode.Uri> {
  const scene =
    typeof target === 'string'
      ? target
      : (/scenes[\\/]([^\\/]+)[\\/]/.exec(target.fsPath)?.[1] ??
        basename(target.fsPath).replace(/\.(scene\.[jt]s|layout\.json)$/, ''));
  const dir = join(root, 'scenes', scene);
  if (!existsSync(dir))
    throw new Error(`No scene "${scene}": create scenes/${scene}/${scene}.scene.ts first.`);
  const layoutUri = vscode.Uri.file(join(dir, `${scene}.layout.json`));
  if (!existsSync(layoutUri.fsPath)) {
    await vscode.workspace.fs.writeFile(layoutUri, new TextEncoder().encode(layoutFile()));
    const sceneFile = ['ts', 'js'].map((e) => join(dir, `${scene}.scene.${e}`)).find(existsSync);
    if (sceneFile) {
      const document = await vscode.workspace.openTextDocument(sceneFile);
      const updated = addLayoutLoad(ts, document.getText(), `${scene}.layout.json`);
      if (updated) {
        await replaceDocument(document, updated);
        await document.save();
      }
    }
  }
  await vscode.commands.executeCommand('vscode.openWith', layoutUri, 'blacklight.sceneEditor');
  return layoutUri;
}
