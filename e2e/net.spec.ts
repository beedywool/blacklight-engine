// Phase 3f gate, browser side: the same rollback match gives the same checksums on V8 (Node,
// Chromium) and JavaScriptCore (WebKit, Bun), and two browsers play a live match through the relay
// without desync. The 10-minute, 4-player, 150 ms, 2 % loss run is packages/net/test/gate.spec.ts.
import { spawnSync } from 'node:child_process';
import { resolve } from 'node:path';
import { chromium, expect, test, webkit, type Browser, type Page } from '@playwright/test';
import type { MatchResult } from '@blacklight/net/testing';
import { startRelay, type RelayServer } from '../servers/relay/src/index';
import { mathFingerprint, runGate, type GateOptions } from './fixtures/net/scenes/lobby/gate';
import { serve } from './server';

const fixture = resolve(import.meta.dirname, 'fixtures/net');
const DEV_PORT = 5361;
const RELAY_PORT = 5362;
/** One minute of the 4-player gate match (150 ms, 20 ms jitter, 2 % loss). */
const FRAMES = 3600;

interface PageWindow {
  netGate: {
    runGate(options: GateOptions): Promise<MatchResult>;
    mathFingerprint(): string;
  };
  netState: { status: string; room?: string; error?: string; desyncs: unknown[] };
  blacklight: {
    scene: {
      net: { session: { checksums: Map<number, number>; frame: number } };
      snapshot(): { objects: { type: string; data: Record<string, unknown> }[] };
    };
  };
}

/** WebKit needs system libraries (`playwright install --with-deps webkit`); CI installs them. */
async function launchWebKit(): Promise<Browser | string> {
  try {
    return await webkit.launch();
  } catch (error) {
    const message = String(error);
    if (/missing dependencies|Executable doesn't exist/i.test(message)) {
      return `WebKit cannot start on this machine (run \`pnpm exec playwright install --with-deps webkit\`): ${message.split('\n')[0]}`;
    }
    throw error;
  }
}

function collectErrors(page: Page): string[] {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  page.on('console', (message) => {
    if (message.type() === 'error') errors.push(message.text());
  });
  return errors;
}

async function browserGate(page: Page) {
  await page.goto(`http://localhost:${DEV_PORT}/?gate`);
  await page.waitForFunction(
    () => (window as unknown as PageWindow).netState?.status === 'gate',
    null,
    {
      timeout: 60_000,
    },
  );
  return page.evaluate(async (frames) => {
    const gate = (window as unknown as PageWindow).netGate;
    const result = await gate.runGate({ frames });
    return {
      fingerprint: gate.mathFingerprint(),
      desyncs: result.desyncs.length,
      checksums: result.checksums[0]!,
    };
  }, FRAMES);
}

test.describe('networking', () => {
  let stopServer: (() => void) | undefined;
  let node: MatchResult;

  test.beforeAll(async () => {
    stopServer = await serve(fixture, 'dev', DEV_PORT);
    node = await runGate({ frames: FRAMES });
    expect(node.desyncs).toEqual([]);
  });
  test.afterAll(() => stopServer?.());

  test('Chromium computes the checksums of Node', async ({ page }) => {
    const errors = collectErrors(page);
    const web = await browserGate(page);
    expect(web.fingerprint).toBe(mathFingerprint());
    expect(web.desyncs).toBe(0);
    expect(web.checksums).toEqual(node.checksums[0]);
    expect(errors).toEqual([]);
  });

  test('WebKit (JavaScriptCore) computes the checksums of Node (V8)', async () => {
    const browser = await launchWebKit();
    test.skip(typeof browser === 'string', String(browser));
    const page = await (browser as Browser).newPage();
    const errors = collectErrors(page);
    const web = await browserGate(page);
    await (browser as Browser).close();
    expect(web.fingerprint).toBe(mathFingerprint());
    expect(web.desyncs).toBe(0);
    expect(web.checksums.length).toBeGreaterThan(100);
    expect(web.checksums).toEqual(node.checksums[0]);
    expect(errors).toEqual([]);
  });

  test('Bun (JavaScriptCore) computes the checksums of Node (V8)', () => {
    const bun = spawnSync('bun', ['scripts/gate.ts', String(FRAMES)], {
      cwd: fixture,
      encoding: 'utf8',
      timeout: 120_000,
    });
    test.skip(
      bun.error !== undefined,
      'Bun is not installed; the WebKit test covers JavaScriptCore.',
    );
    expect(bun.status, bun.stderr).toBe(0);
    const out = JSON.parse(bun.stdout.trim().split('\n').at(-1)!) as {
      engine: string;
      fingerprint: string;
      desyncs: number;
      checksums: [number, number][];
    };
    expect(out.engine).toContain('JavaScriptCore');
    expect(out.fingerprint).toBe(mathFingerprint());
    expect(out.desyncs).toBe(0);
    expect(out.checksums).toEqual(node.checksums[0]);
  });

  test.describe('live match through the relay', () => {
    let relay: RelayServer;
    test.beforeAll(async () => {
      relay = await startRelay({ port: RELAY_PORT, host: '127.0.0.1' });
    });
    test.afterAll(() => relay.close());

    test('two browsers play Push-Push online without desync', async () => {
      // GitHub's Windows runner draws both pages in software; the match crawls or stops answering.
      test.skip(
        process.platform === 'win32',
        'Windows: two software-drawn browsers are too slow on the CI runner. The online check there ' +
          'is servers/relay/test/party-game.spec.ts (two headless games over the real relay, pnpm ' +
          'test); a full match between two Windows PCs is MANUAL_TESTS.md "Online play" step 6 (DECISIONS ' +
          '2026-11-01).',
      );
      // The guest runs in WebKit when it can: a live V8 against JavaScriptCore match.
      const engines: Browser[] = [await chromium.launch()];
      const webkitBrowser = await launchWebKit();
      engines.push(typeof webkitBrowser === 'string' ? await chromium.launch() : webkitBrowser);
      const url = `http://localhost:${DEV_PORT}/?relay=ws://127.0.0.1:${RELAY_PORT}&bots`;
      // Small pages: the test checks the simulation, and on GitHub's Windows runner two software-
      // rendered 1280×720 pages advanced the match by about 3 steps a second (152 in 60 s).
      const viewport = { width: 480, height: 270 };
      const host = await engines[0]!.newPage({ viewport });
      const hostErrors = collectErrors(host);
      await host.goto(`${url}&players=2&name=Host`);
      const code = await host.waitForFunction(
        () => (window as unknown as PageWindow).netState?.room,
        null,
        { timeout: 60_000 },
      );
      const guest = await engines[1]!.newPage({ viewport });
      const guestErrors = collectErrors(guest);
      await guest.goto(`${url}&room=${String(await code.jsonValue())}&name=Guest`);
      for (const page of [host, guest]) {
        await page.waitForFunction(
          () => (window as unknown as PageWindow).netState?.status === 'playing',
          null,
          { timeout: 60_000 },
        );
      }
      // Let them play: bots change input every third of a second, so predictions fail often.
      const read = (page: Page) =>
        page.evaluate(() => {
          const w = window as unknown as PageWindow;
          const session = w.blacklight.scene.net.session;
          return {
            frame: session.frame,
            checksums: [...session.checksums],
            desyncs: w.netState.desyncs.length,
          };
        });
      await expect
        .poll(async () => (await read(guest)).frame, { timeout: 60_000 })
        .toBeGreaterThan(600);
      const [a, b] = [await read(host), await read(guest)];
      const theirs = new Map(b.checksums);
      const common = a.checksums.filter(([frame]) => theirs.has(frame));
      expect(common.length).toBeGreaterThan(10);
      for (const [frame, hash] of common) expect(theirs.get(frame), `step ${frame}`).toBe(hash);
      expect(a.desyncs + b.desyncs).toBe(0);
      // Only the game's fields are state: nothing the renderer adds to objects in a browser.
      const fields = await host.evaluate(() =>
        (window as unknown as PageWindow).blacklight.scene
          .snapshot()
          .objects.filter((o) => o.type === 'Wrestler')
          .map((o) => Object.keys(o.data).sort()),
      );
      for (const keys of fields)
        expect(keys).toEqual(['bumps', 'cooldown', 'facing', 'shoves', 'stunned']);
      expect([...hostErrors, ...guestErrors]).toEqual([]);
      for (const engine of engines) await engine.close();
    });
  });
});
