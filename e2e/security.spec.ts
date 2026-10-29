// SPEC §11.1 "Security": each hardening measure checked in a release build of the desktop fixture,
// served as a web build (the desktop-only measures are in desktop.spec.ts).
import { readFileSync, readdirSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { expect, test, type Page } from '@playwright/test';
import { run, serve } from './server';

const fixture = resolve(import.meta.dirname, 'fixtures/desktop');
const port = 5336;
const dataset = (page: Page, key: string) =>
  page.locator('#game').evaluate((el, k) => (el as HTMLElement).dataset[k], key);

test.describe.configure({ mode: 'serial' });
let stop: (() => void) | undefined;
test.beforeAll(async () => {
  test.setTimeout(300_000);
  run('pnpm', ['build'], fixture);
  stop = await serve(fixture, 'preview', port);
});
test.afterAll(() => stop?.());

async function open(page: Page): Promise<void> {
  await page.goto(`http://localhost:${port}/`);
  await expect(page.locator('#game')).toHaveAttribute('data-ready', '1', { timeout: 30_000 });
}

test('SEC-08: strict CSP, no eval, no inline script', async ({ page }) => {
  const violations: string[] = [];
  page.on('console', (m) => {
    if (/Content Security Policy/.test(m.text())) violations.push(m.text());
  });
  await open(page);
  const csp = await page
    .locator('meta[http-equiv="Content-Security-Policy"]')
    .getAttribute('content');
  expect(csp).toContain("script-src 'self' 'wasm-unsafe-eval'");
  expect(csp).toContain("worker-src 'self' blob:");
  expect(csp).not.toMatch(/'unsafe-eval'|script-src[^;]*'unsafe-inline'/);
  // Code evaluated by the test driver is exempt from CSP, so the page itself must try: a string
  // timer (eval in the page's own task) and an inline script.
  const result = await page.evaluate(
    () =>
      new Promise<{ blocked: string[]; evalRan: boolean; inline: boolean }>((done) => {
        const blocked: string[] = [];
        document.addEventListener('securitypolicyviolation', (e) => blocked.push(e.blockedURI));
        const script = document.createElement('script');
        script.textContent = 'window.__inline = true';
        document.head.append(script);
        // eslint-disable-next-line @typescript-eslint/no-implied-eval
        setTimeout('window.__evalRan = true' as unknown as () => void, 0);
        setTimeout(() => {
          const w = window as { __inline?: boolean; __evalRan?: boolean };
          done({ blocked, evalRan: w.__evalRan === true, inline: w.__inline === true });
        }, 300);
      }),
  );
  expect(result.evalRan).toBe(false);
  expect(result.inline).toBe(false);
  expect(result.blocked).toEqual(expect.arrayContaining(['inline', 'eval']));
  expect(violations.length).toBeGreaterThan(0);
});

test('SEC-01: devtools shortcuts and the context menu are blocked', async ({ page }) => {
  await open(page);
  const prevented = await page.evaluate(() => {
    const press = (code: string, init: KeyboardEventInit = {}) => {
      const event = new KeyboardEvent('keydown', {
        code,
        cancelable: true,
        bubbles: true,
        ...init,
      });
      document.body.dispatchEvent(event);
      return event.defaultPrevented;
    };
    const menu = new MouseEvent('contextmenu', { cancelable: true, bubbles: true });
    document.querySelector('canvas')!.dispatchEvent(menu);
    return {
      f12: press('F12'),
      inspect: press('KeyI', { ctrlKey: true, shiftKey: true }),
      console: press('KeyJ', { ctrlKey: true, shiftKey: true }),
      macInspect: press('KeyI', { metaKey: true, altKey: true }),
      source: press('KeyU', { ctrlKey: true }),
      menu: menu.defaultPrevented,
      ordinary: press('KeyM'), // control: keys bound to no action are left alone
    };
  });
  expect(prevented).toEqual({
    f12: true,
    inspect: true,
    console: true,
    macInspect: true,
    source: true,
    menu: true,
    ordinary: false,
  });
  expect(await page.evaluate(() => 'blacklight' in window)).toBe(false);
});

test('SEC-03: the game code is obfuscated, the engine is not', () => {
  const dir = join(fixture, 'dist', 'assets');
  const chunks = readdirSync(dir).filter((f) => f.endsWith('.js'));
  const scene = chunks.find((f) => f.startsWith('main.scene'))!;
  const code = readFileSync(join(dir, scene), 'utf8');
  expect(code).toMatch(/_0x[0-9a-f]{4,}/);
  expect(code).not.toContain('const gold');
  const engine = chunks.filter((f) => !f.startsWith('main.scene') && !f.includes('.object'));
  expect(engine.some((f) => !/_0x[0-9a-f]{4,}\(/.test(readFileSync(join(dir, f), 'utf8')))).toBe(
    true,
  );
});

test('SEC-05, SEC-09: protected values are watched', async ({ page }) => {
  await open(page);
  await expect(page.locator('#game')).toHaveAttribute('data-protected', 'true');
});

test('SEC-06: a debugger pausing the game is detected', async ({ page }) => {
  await open(page);
  const cdp = await page.context().newCDPSession(page);
  cdp.on('Debugger.paused', () => {
    setTimeout(() => void cdp.send('Debugger.resume').catch(() => undefined), 300);
  });
  await cdp.send('Debugger.enable');
  await expect(page.locator('#game')).toHaveAttribute('data-tamper', 'debugger', {
    timeout: 10_000,
  });
  await cdp.send('Debugger.disable');
});

test('SV-03, SV-04: a modified save is rejected in the browser too, the backup offered', async ({
  page,
}) => {
  await open(page);
  await page.keyboard.press('Enter');
  await expect(page.locator('#game')).toHaveAttribute('data-saved', '10');
  await page.keyboard.press('Enter');
  await expect(page.locator('#game')).toHaveAttribute('data-saved', '20');
  // A save editor changes a byte of the IndexedDB record.
  const header = await page.evaluate(
    () =>
      new Promise<string>((done, fail) => {
        const req = indexedDB.open('blacklight:dev.blacklight.fixture.desktop');
        req.onerror = () => fail(req.error);
        req.onsuccess = () => {
          const store = req.result.transaction('files', 'readwrite').objectStore('files');
          const get = store.get('saves/1.sav');
          get.onsuccess = () => {
            const bytes = new Uint8Array(get.result as ArrayBuffer);
            bytes[bytes.length - 10]! ^= 1;
            store.put(bytes.buffer, 'saves/1.sav').onsuccess = () =>
              done(String.fromCharCode(...bytes.subarray(0, 4)));
          };
        };
      }),
  );
  expect(header).toBe('BLSV');
  await page.reload();
  await expect(page.locator('#game')).toHaveAttribute('data-ready', '1');
  expect(await dataset(page, 'save')).toBe('tampered+backup');
  expect(await dataset(page, 'gold')).toBe('10');
});
