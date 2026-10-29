import * as vscode from 'vscode';
import { registerFileCommands } from './commands';
import { completionData, registerCompletion } from './completion-provider';
import { AnimationEditorProvider } from './editors/animation';
import { openSceneEditor, SceneEditorProvider } from './editors/scene';
import { SlicerEditorProvider } from './editors/slicer';
import { TimelineEditorProvider } from './editors/timeline';
import { listScenes } from './core/project';
import { gameRoot, guarded } from './game';
import { LiveGame, registerLive, type LaunchProvider, type ObjectsTree } from './live';
import { openPanel, registry, type ControllerRegistry } from './panel';
import { AssetsController, ConfigController, configDocument, UiPreviewController } from './panels';

/** What `activate` returns: used by the integration tests and by other extensions. */
export interface BlacklightApi {
  controllers: ControllerRegistry;
  live: LiveGame;
  objects: ObjectsTree;
  launch: LaunchProvider;
  completionData: typeof completionData;
}

const LOCAL_FRAMES = ['http://localhost:*', 'http://127.0.0.1:*', 'https://localhost:*'];

export function activate(context: vscode.ExtensionContext): BlacklightApi {
  const extension = context.extensionUri;
  const live = new LiveGame();
  registerFileCommands(context);
  registerCompletion(context);
  const { tree: objects, launch } = registerLive(context, live);
  const editor = { webviewOptions: { retainContextWhenHidden: true } };

  context.subscriptions.push(
    vscode.window.registerCustomEditorProvider(
      'blacklight.animationEditor',
      new AnimationEditorProvider(extension),
      editor,
    ),
    vscode.window.registerCustomEditorProvider(
      'blacklight.sceneEditor',
      new SceneEditorProvider(extension),
      editor,
    ),
    vscode.window.registerCustomEditorProvider(
      'blacklight.timelineEditor',
      new TimelineEditorProvider(extension, live),
      editor,
    ),
    vscode.window.registerCustomEditorProvider(
      'blacklight.sheetSlicer',
      new SlicerEditorProvider(extension),
      editor,
    ),

    vscode.commands.registerCommand(
      'blacklight.openAnimationEditor',
      guarded(async (uri?: vscode.Uri) => {
        const target = uri ?? vscode.window.activeTextEditor?.document.uri;
        if (!target?.fsPath.endsWith('.anim.json'))
          throw new Error('Open an .anim.json file first.');
        await vscode.commands.executeCommand(
          'vscode.openWith',
          target,
          'blacklight.animationEditor',
          vscode.ViewColumn.Beside,
        );
        return registry.latest('animation');
      }),
    ),
    vscode.commands.registerCommand(
      'blacklight.sliceSheet',
      guarded(async (uri?: vscode.Uri) => {
        if (!uri?.fsPath.endsWith('.png'))
          throw new Error('Choose a .png sprite sheet in the explorer.');
        await vscode.commands.executeCommand('vscode.openWith', uri, 'blacklight.sheetSlicer');
        return registry.latest('slicer');
      }),
    ),
    vscode.commands.registerCommand(
      'blacklight.openSceneEditor',
      guarded(async (target?: vscode.Uri | string) => {
        const root = gameRoot(target instanceof vscode.Uri ? target : undefined);
        let scene = target;
        if (!scene) {
          scene = await vscode.window.showQuickPick(listScenes(root), {
            placeHolder: 'Scene to edit',
          });
          if (!scene) return undefined;
        }
        await openSceneEditor(root, scene);
        return registry.latest('scene');
      }),
    ),
    vscode.commands.registerCommand(
      'blacklight.previewUi',
      guarded(async (uri?: vscode.Uri) => {
        const file = uri ?? vscode.window.activeTextEditor?.document.uri;
        if (!file?.fsPath.endsWith('.vue'))
          throw new Error('Open a .vue screen or component first.');
        const controller = new UiPreviewController(file, live);
        openPanel(extension, controller, 'blacklight.uiPreview', `Preview ${controller.screen}`, {
          frames: LOCAL_FRAMES,
          column: vscode.ViewColumn.Beside,
        });
        await controller.start();
        return controller;
      }),
    ),
    vscode.commands.registerCommand(
      'blacklight.openConfig',
      guarded(async (uri?: vscode.Uri) => {
        const { root, document } = await configDocument(uri);
        const controller = new ConfigController(document, root);
        openPanel(extension, controller, 'blacklight.config', 'Game configuration');
        return controller;
      }),
    ),
    vscode.commands.registerCommand(
      'blacklight.openAssets',
      guarded(async (uri?: vscode.Uri) => {
        const controller = new AssetsController(gameRoot(uri));
        openPanel(extension, controller, 'blacklight.assets', 'Assets');
        return controller;
      }),
    ),
  );

  return { controllers: registry, live, objects, launch, completionData };
}

export function deactivate(): void {}
