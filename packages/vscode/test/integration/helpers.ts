import { spawn, type ChildProcess } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import * as vscode from 'vscode';
import type { BlacklightApi } from '../../src/extension';

export const workspace = process.env.BLACKLIGHT_TEST_WORKSPACE!;
export const file = (path: string) => join(workspace, path);
export const read = (path: string) => readFileSync(file(path), 'utf8');

export async function api(): Promise<BlacklightApi> {
  const extension = vscode.extensions.getExtension<BlacklightApi>('blacklight.blacklight-vscode');
  if (!extension) throw new Error('The extension under test is not loaded.');
  return extension.activate();
}

/** Polls until `check` returns a truthy value. */
export async function waitFor<T>(
  check: () => T | Promise<T>,
  what: string,
  timeout = 15_000,
): Promise<NonNullable<T>> {
  const deadline = Date.now() + timeout;
  for (;;) {
    try {
      const value = await check();
      if (value) return value as NonNullable<T>;
    } catch (error) {
      if (Date.now() > deadline) throw error;
    }
    if (Date.now() > deadline) throw new Error(`Timed out waiting for ${what}`);
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
}

export function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

export function equal<T>(actual: T, expected: T, message: string): void {
  const a = JSON.stringify(actual);
  const e = JSON.stringify(expected);
  if (a !== e) throw new Error(`${message}\n  expected ${e}\n  received ${a}`);
}

/** Closes every editor and panel between tests. */
export async function closeAll(): Promise<void> {
  await vscode.commands.executeCommand('workbench.action.closeAllEditors');
}

// ---------------------------------------------------------------- dev server and a stand-in game

const PORT = 5371;
let server: ChildProcess | undefined;
/** What the dev server printed, for the error when it never starts. */
let serverOutput = '';

/** Starts `blacklight dev` on the test workspace (once) and returns its info file. */
export async function devServer(): Promise<{ url: string; port: number; token: string }> {
  const info = join(workspace, '.blacklight', 'dev-server.json');
  if (!server) {
    serverOutput = '';
    server = spawn(
      'node',
      [process.env.BLACKLIGHT_CLI!, 'dev', workspace, '--port', String(PORT), '--strict-port'],
      {
        cwd: workspace,
        stdio: ['ignore', 'pipe', 'pipe'],
        detached: process.platform !== 'win32',
      },
    );
    const keep = (chunk: Buffer) => (serverOutput = (serverOutput + chunk.toString()).slice(-4000));
    server.stdout?.on('data', keep);
    server.stderr?.on('data', keep);
    server.on('error', (error) => (serverOutput += `\n${error.message}`));
    server.on('exit', (code) => (serverOutput += `\n(exited with code ${code})`));
  }
  try {
    await waitFor(() => existsSync(info), 'the dev server', 60_000);
  } catch (error) {
    throw new Error(`${(error as Error).message}. Its output:\n${serverOutput}`, { cause: error });
  }
  return JSON.parse(readFileSync(info, 'utf8')) as { url: string; port: number; token: string };
}

export function stopDevServer(): void {
  if (!server?.pid) return;
  try {
    if (process.platform === 'win32') server.kill();
    else process.kill(-server.pid, 'SIGTERM');
  } catch {
    // Already stopped.
  }
  server = undefined;
}

type Handler = (params: Record<string, unknown>) => unknown;

/**
 * A game as the debug channel sees it: a WebSocket client of the dev server that announces itself
 * and answers requests, recording them. Stands in for the browser tab.
 */
export async function fakeGame(
  client: string,
  handlers: Record<string, Handler>,
): Promise<{ calls: { method: string; params: Record<string, unknown> }[]; close(): void }> {
  const info = await devServer();
  const WebSocketClass = (globalThis as unknown as { WebSocket: typeof WebSocket }).WebSocket;
  const socket = new WebSocketClass(`ws://localhost:${info.port}/?token=${info.token}`, 'vite-hmr');
  const calls: { method: string; params: Record<string, unknown> }[] = [];
  const send = (data: unknown) =>
    socket.send(JSON.stringify({ type: 'custom', event: 'blacklight:debug', data }));
  socket.addEventListener('message', (event) => {
    const payload = JSON.parse(String(event.data)) as {
      type: string;
      event?: string;
      data?: {
        kind: string;
        id: string;
        method: string;
        params?: Record<string, unknown>;
        target?: string;
      };
    };
    const message = payload.data;
    if (
      payload.type !== 'custom' ||
      payload.event !== 'blacklight:debug' ||
      message?.kind !== 'request'
    )
      return;
    if (message.target && message.target !== client) return;
    const handler = handlers[message.method];
    if (!handler) return;
    calls.push({ method: message.method, params: message.params ?? {} });
    Promise.resolve(handler(message.params ?? {})).then(
      (result) => send({ kind: 'response', id: message.id, client, result: result ?? null }),
      (error: Error) => send({ kind: 'response', id: message.id, client, error: error.message }),
    );
  });
  await new Promise((resolve) => socket.addEventListener('open', resolve));
  send({ kind: 'event', client, type: 'hello', data: { client, scene: 'arena' } });
  return { calls, close: () => socket.close() };
}
