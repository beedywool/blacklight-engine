// Phase 0 gate: `pnpm create blacklight` → the empty project runs in the browser.
import { spawn, spawnSync, type ChildProcess } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { expect, test } from '@playwright/test';

const repo = resolve(import.meta.dirname, '..');
const port = 5199;
const shell = process.platform === 'win32';
let work: string;
let server: ChildProcess | undefined;

function run(command: string, args: string[], cwd: string): void {
  const result = spawnSync(command, args, { cwd, stdio: 'inherit', shell });
  if (result.status !== 0) throw new Error(`${command} ${args.join(' ')} failed in ${cwd}`);
}

test.beforeAll(async () => {
  work = mkdtempSync(join(tmpdir(), 'blacklight-e2e-'));
  run(
    process.execPath,
    [join(repo, 'packages/create/dist/index.js'), 'my-game', '--link', repo],
    work,
  );
  const game = join(work, 'my-game');
  run('pnpm', ['install'], game);

  // Own process group on POSIX so teardown stops pnpm and the Vite process it starts.
  server = spawn('pnpm', ['dev', '--port', String(port), '--strict-port'], {
    cwd: game,
    shell,
    detached: !shell,
    stdio: 'inherit',
  });
  let exited: number | null | undefined;
  server.on('exit', (code) => (exited = code));
  const deadline = Date.now() + 60_000;
  for (;;) {
    if (exited !== undefined) throw new Error(`dev server exited with ${exited}`);
    if (Date.now() > deadline) throw new Error('dev server did not answer in 60 s');
    try {
      if ((await fetch(`http://localhost:${port}/`)).ok) break;
    } catch {
      // not listening yet
    }
    await new Promise((wait) => setTimeout(wait, 250));
  }
});

test.afterAll(() => {
  if (server?.pid) {
    if (shell) spawnSync('taskkill', ['/pid', String(server.pid), '/T', '/F']);
    else process.kill(-server.pid, 'SIGTERM');
  }
  rmSync(work, { recursive: true, force: true });
});

test('the empty template runs in the browser', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  page.on('console', (message) => {
    if (message.type() === 'error') errors.push(message.text());
  });

  await page.goto(`http://localhost:${port}/`);
  const mount = page.locator('#game');
  await expect(mount).toHaveAttribute('data-blacklight-state', 'running', { timeout: 30_000 });
  await expect(mount).toHaveAttribute('data-blacklight-scene', 'title');
  await expect(page).toHaveTitle('My Game');

  const canvas = mount.locator('canvas');
  await expect(canvas).toBeVisible();
  // The title text and bulb draw light pixels on the black background. WebGL clears its buffer
  // after each frame, so count them on a screenshot rather than on the canvas.
  await page.waitForTimeout(500);
  const png = (await canvas.screenshot()).toString('base64');
  const lit = await page.evaluate(async (data) => {
    const image = new Image();
    image.src = `data:image/png;base64,${data}`;
    await image.decode();
    const copy = new OffscreenCanvas(image.width, image.height);
    const context = copy.getContext('2d')!;
    context.drawImage(image, 0, 0);
    const pixels = context.getImageData(0, 0, image.width, image.height).data;
    let count = 0;
    for (let i = 0; i < pixels.length; i += 4) if (pixels[i]! > 128) count++;
    return count;
  }, png);
  expect(lit).toBeGreaterThan(1000);
  expect(errors).toEqual([]);
});
