import { existsSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import * as vscode from 'vscode';
import { listScenes, rel } from './core/project';
import {
  objectFiles,
  sceneFiles,
  timelineFile,
  toFolderName,
  validateName,
  type ObjectKind,
} from './core/templates';
import { gameRoot, guarded } from './game';

async function writeFiles(root: string, files: Record<string, string>): Promise<vscode.Uri[]> {
  const created: vscode.Uri[] = [];
  for (const [path, content] of Object.entries(files)) {
    const uri = vscode.Uri.file(join(root, path));
    if (existsSync(uri.fsPath)) throw new Error(`${path} already exists.`);
    await vscode.workspace.fs.writeFile(uri, new TextEncoder().encode(content));
    created.push(uri);
  }
  return created;
}

async function askName(
  prompt: string,
  existing: string[],
  placeHolder: string,
): Promise<string | undefined> {
  return vscode.window.showInputBox({
    prompt,
    placeHolder,
    validateInput: (v) => validateName(v, existing),
  });
}

/** Options of `blacklight.newObject` when called from code or tests. */
export interface NewObjectOptions {
  name?: string;
  kind?: ObjectKind;
  /** Scene that owns the object; global when omitted. */
  scene?: string;
}

/** Registers New Scene, New Object and New UI Timeline. */
export function registerFileCommands(context: vscode.ExtensionContext): void {
  context.subscriptions.push(
    vscode.commands.registerCommand(
      'blacklight.newScene',
      guarded(async (arg?: vscode.Uri | string) => {
        const root = gameRoot(arg instanceof vscode.Uri ? arg : undefined);
        const existing = listScenes(root);
        const input =
          typeof arg === 'string'
            ? arg
            : await askName('Name of the new scene', existing, 'battle');
        if (!input) return undefined;
        const problem = validateName(input, existing);
        if (problem) throw new Error(problem);
        const folder = toFolderName(input);
        const created = await writeFiles(root, sceneFiles(folder));
        await vscode.window.showTextDocument(created[0]!);
        return created.map((uri) => rel(root, uri.fsPath));
      }),
    ),
    vscode.commands.registerCommand(
      'blacklight.newObject',
      guarded(async (arg?: vscode.Uri | NewObjectOptions) => {
        const options: NewObjectOptions = arg instanceof vscode.Uri || !arg ? {} : arg;
        const root = gameRoot(arg instanceof vscode.Uri ? arg : undefined);
        // From the explorer: a scene folder (or its objects/ folder) makes a scene-local object.
        let scene = options.scene;
        if (arg instanceof vscode.Uri) scene = /^scenes\/([^/]+)/.exec(rel(root, arg.fsPath))?.[1];
        const base = scene ? `scenes/${scene}/objects` : 'objects';
        const existing = existsSync(join(root, base)) ? readdirSync(join(root, base)) : [];
        const input =
          options.name ??
          (await askName(
            `Name of the new object${scene ? ` in scene ${scene}` : ''}`,
            existing,
            'enemy',
          ));
        if (!input) return undefined;
        const problem = validateName(input, existing);
        if (problem) throw new Error(problem);
        let kind = options.kind;
        if (!kind) {
          const pick = await vscode.window.showQuickPick(
            [
              {
                label: 'Animated sprite',
                description: 'Sprite with an .anim.json',
                objectKind: 'animated' as const,
              },
              { label: 'Sprite', description: 'One image', objectKind: 'sprite' as const },
              { label: 'Shape', description: 'Drawn with Graphics', objectKind: 'shape' as const },
            ],
            { placeHolder: 'Kind of object' },
          );
          if (!pick) return undefined;
          kind = pick.objectKind;
        }
        const created = await writeFiles(root, objectFiles(toFolderName(input), kind, base));
        await vscode.window.showTextDocument(created[0]!);
        return created.map((uri) => rel(root, uri.fsPath));
      }),
    ),
    vscode.commands.registerCommand(
      'blacklight.newTimeline',
      guarded(async (arg?: vscode.Uri | string) => {
        const root = gameRoot(arg instanceof vscode.Uri ? arg : undefined);
        const existing = existsSync(join(root, 'animations'))
          ? readdirSync(join(root, 'animations')).map((f) => f.replace(/\.timeline\.json$/, ''))
          : [];
        const input =
          typeof arg === 'string'
            ? arg
            : await askName('Name of the new UI timeline', existing, 'menu-intro');
        if (!input) return undefined;
        const problem = validateName(input, existing);
        if (problem) throw new Error(problem);
        const path = `animations/${toFolderName(input)}.timeline.json`;
        const [uri] = await writeFiles(root, { [path]: timelineFile(1) });
        await vscode.commands.executeCommand('vscode.openWith', uri, 'blacklight.timelineEditor');
        return [path];
      }),
    ),
  );
}
