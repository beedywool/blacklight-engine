import { existsSync } from 'node:fs';
import { join } from 'node:path';
import * as vscode from 'vscode';
import { findGameRoot } from './core/project';

/**
 * The game folder for a command: the one containing `uri`, else the active editor's, else the
 * first workspace folder that is a game.
 *
 * @throws Error when the workspace has no game.
 */
export function gameRoot(uri?: vscode.Uri): string {
  const candidates = [
    uri?.fsPath,
    vscode.window.activeTextEditor?.document.uri.fsPath,
    ...(vscode.workspace.workspaceFolders ?? []).map((f) => f.uri.fsPath),
  ];
  for (const candidate of candidates) {
    if (!candidate) continue;
    const root = findGameRoot(candidate);
    if (root) return root;
  }
  // A workspace holding several games (a monorepo): the first folder with a game.config.ts below it.
  for (const folder of vscode.workspace.workspaceFolders ?? []) {
    for (const dir of ['.', 'game', 'client']) {
      const path = join(folder.uri.fsPath, dir);
      if (existsSync(join(path, 'game.config.ts'))) return path;
    }
  }
  throw new Error(
    'No Blacklight game here: open a folder with a game.config.ts (create one with `pnpm dlx https://github.com/beedywool/blacklight-engine/releases/latest/download/create-blacklight.tgz my-game`).',
  );
}

/** Runs a command body and shows its error instead of failing silently. */
export function guarded<A extends unknown[], R>(
  body: (...args: A) => Promise<R>,
): (...args: A) => Promise<R | undefined> {
  return async (...args: A) => {
    try {
      return await body(...args);
    } catch (error) {
      void vscode.window.showErrorMessage(error instanceof Error ? error.message : String(error));
      if (process.env.BLACKLIGHT_VSCODE_TEST) throw error;
      return undefined;
    }
  };
}
