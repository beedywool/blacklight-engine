import { join, posix } from 'node:path';
import * as vscode from 'vscode';
import {
  assetRef,
  completionContext,
  fileKind,
  suggestions,
  type CompletionData,
  type Suggestion,
} from './core/completion';
import {
  animationNames,
  assetKey,
  findGameRoot,
  listAssets,
  listObjects,
  listScenes,
  objectOfFile,
  readActions,
  rel,
  walk,
} from './core/project';

const KINDS: Record<Suggestion['kind'], vscode.CompletionItemKind> = {
  property: vscode.CompletionItemKind.Property,
  value: vscode.CompletionItemKind.Value,
  file: vscode.CompletionItemKind.File,
  class: vscode.CompletionItemKind.Class,
  event: vscode.CompletionItemKind.Event,
};

/** What completion offers in a file of the game at `root`. */
export function completionData(root: string, file: string): CompletionData {
  const object = objectOfFile(root, file);
  const animations = object?.anim
    ? animationNames(join(root, object.anim))
    : [
        ...new Set(
          listObjects(root).flatMap((o) => (o.anim ? animationNames(join(root, o.anim)) : [])),
        ),
      ];
  const assets = listAssets(root);
  const dir = posix.dirname(rel(root, file));
  // Scene and object files reference their own folder's files with ./
  const base = /^(scenes\/[^/]+(?:\/objects\/[^/]+)?|objects\/[^/]+)/.exec(dir)?.[1] ?? dir;
  return {
    animations,
    actions: readActions(root),
    scenes: listScenes(root),
    objects: [...new Set(listObjects(root).map((o) => o.name))],
    screens: [
      ...new Set(
        ['ui', ...listScenes(root).map((s) => `scenes/${s}/ui`)]
          .flatMap((d) => walk(join(root, d)))
          .filter((f) => f.endsWith('.vue'))
          .map((f) => posix.basename(f.split('\\').join('/'), '.vue')),
      ),
    ],
    assetRefs: assets.map((a) => assetRef(a, base)),
    sounds: [
      ...new Set(assets.filter((a) => /\.(ogg|m4a|mp3|wav|opus|aac|flac)$/.test(a)).map(assetKey)),
    ],
  };
}

/** Completion of static props, animation names, input actions, asset paths, scene and object names. */
export function registerCompletion(context: vscode.ExtensionContext): void {
  const provider: vscode.CompletionItemProvider = {
    provideCompletionItems(document, position) {
      const root = findGameRoot(document.uri.fsPath);
      if (!root) return undefined;
      const before = document.getText(
        new vscode.Range(new vscode.Position(Math.max(0, position.line - 40), 0), position),
      );
      const kind = fileKind(document.uri.fsPath);
      const found = completionContext(before, kind);
      if (!found) return undefined;
      const line = document.lineAt(position.line).text.slice(0, position.character);
      // Replace what is typed inside the quotes (or the word), not the quote itself.
      const typed =
        found.kind === 'static' ? /[A-Za-z]*$/.exec(line)![0] : /[^'"`]*$/.exec(line)![0];
      const range = new vscode.Range(position.translate(0, -typed.length), position);
      return suggestions(found, kind, completionData(root, document.uri.fsPath)).map((s, i) => {
        const item = new vscode.CompletionItem(s.label, KINDS[s.kind]);
        item.detail = s.detail;
        if (s.documentation) item.documentation = new vscode.MarkdownString(s.documentation);
        if (s.snippet) item.insertText = new vscode.SnippetString(s.snippet);
        item.range = range;
        if (found.kind === 'static') item.filterText = s.label.replace(/^static /, '');
        item.sortText = String(i).padStart(4, '0');
        return item;
      });
    },
  };
  context.subscriptions.push(
    vscode.languages.registerCompletionItemProvider(
      [
        { language: 'typescript', scheme: 'file' },
        { language: 'javascript', scheme: 'file' },
        { language: 'vue', scheme: 'file' },
      ],
      provider,
      "'",
      '"',
      '`',
      '/',
    ),
  );
}
