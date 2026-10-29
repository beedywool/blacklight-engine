// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { EventBus, ModuleHost, WebPlatform, type Game } from '@blacklight/core';
import {
  consentDialog,
  DEFAULT_CONSENT_TEXTS,
  parseDsn,
  parseStack,
  scrubFilename,
  telemetry,
  type SentryEvent,
  type Telemetry,
} from '../src/index';

const DSN = 'https://pub123@errors.example.com:8443/sentry/42';
const ENVELOPE_URL =
  'https://errors.example.com:8443/sentry/api/42/envelope/?sentry_key=pub123&sentry_version=7&sentry_client=blacklight-telemetry%2F0.0.0';

let hosts: ModuleHost[] = [];
afterEach(async () => {
  for (const host of hosts) await host.dispose();
  hosts = [];
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

interface Sent {
  url: string;
  header: Record<string, unknown>;
  item: Record<string, unknown>;
  event: SentryEvent;
}

/** Stubs fetch; `status` decides each answer (a thrown TypeError means offline). */
function backend(status: () => number | 'offline' = () => 200): Sent[] {
  const sent: Sent[] = [];
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string, init: RequestInit) => {
      const code = status();
      if (code === 'offline') throw new TypeError('Failed to fetch');
      const [header, item, event] = String(init.body).split('\n');
      if (code < 300) {
        sent.push({
          url,
          header: JSON.parse(header!),
          item: JSON.parse(item!),
          event: JSON.parse(event!),
        });
      }
      return new Response('{}', { status: code });
    }),
  );
  return sent;
}

async function start(
  options: object = { dsn: DSN },
  extra: Partial<Record<'ui' | 'scene', unknown>> = {},
  platform = new WebPlatform('com.example.test'),
): Promise<{ api: Telemetry; game: Game; host: ModuleHost }> {
  const mount = document.createElement('div');
  document.body.append(mount);
  const game = {
    config: { id: 'com.example.test', version: '1.2.3', modules: { telemetry: options } },
    platform,
    events: new EventBus(),
    mount,
    ...extra,
  } as unknown as Game;
  const host = new ModuleHost(game);
  hosts.push(host);
  await host.install({ definitions: [telemetry], dev: false });
  return { api: host.apis.telemetry as Telemetry, game, host };
}

const STACK = `TypeError: boom
    at Player.update (file:///home/alice/Games/My%20Game/resources/app.asar/assets/game-abc.js:10:5)
    at https://example.com/assets/main.js?v=3:20:7
    at file:///C:/Users/alice/secret.js:1:1`;

describe('DSN and stacks', () => {
  it('parses DSNs with a port and a path, and explains invalid ones', () => {
    expect(parseDsn(DSN)).toMatchObject({
      publicKey: 'pub123',
      projectId: '42',
      envelopeUrl: ENVELOPE_URL,
    });
    expect(parseDsn('https://k@o1.ingest.sentry.io/7').envelopeUrl).toMatch(
      /^https:\/\/o1\.ingest\.sentry\.io\/api\/7\/envelope\/\?sentry_key=k&/,
    );
    expect(() => parseDsn('https://errors.example.com/42')).toThrow(/public key before "@"/);
    expect(() => parseDsn('nope')).toThrow(/project settings/);
  });

  it('parses V8 and Gecko stacks oldest first and scrubs locations', () => {
    expect(parseStack(STACK).map((f) => f.filename)).toEqual([
      'app:///secret.js',
      'app:///assets/main.js',
      'app:///assets/game-abc.js',
    ]);
    expect(parseStack('update@https://x.dev/assets/a.js:3:4\n@https://x.dev/b.js:1:2')).toEqual([
      { filename: 'app:///b.js', lineno: 1, colno: 2, in_app: true },
      { function: 'update', filename: 'app:///assets/a.js', lineno: 3, colno: 4, in_app: true },
    ]);
    expect(scrubFilename('capacitor://localhost/main.js#x')).toBe('app:///main.js');
  });
});

describe('telemetry module', () => {
  it('records nothing before consent', async () => {
    const sent = backend();
    const { api } = await start();
    expect(api.consent).toBe('unknown');
    expect(await api.captureException(new Error('x'))).toBeUndefined();
    expect(await api.track('start')).toBeUndefined();
    await api.flush();
    expect(sent).toEqual([]);
    expect(fetch).not.toHaveBeenCalled();
  });

  it('sends a valid envelope without personal data after consent', async () => {
    const sent = backend();
    const { api, game } = await start();
    await api.setConsent(true);
    game.events.emit('scene', { name: 'battle' });
    const error = new TypeError('boom');
    error.stack = STACK;
    const id = await api.captureException(error, { level: 3 });
    await api.flush();
    expect(sent).toHaveLength(1);
    const [{ url, header, item, event }] = sent as [Sent];
    expect(url).toBe(ENVELOPE_URL);
    expect(header).toMatchObject({ event_id: id, dsn: DSN });
    expect(item.type).toBe('event');
    expect(event).toMatchObject({
      event_id: id,
      platform: 'javascript',
      level: 'error',
      release: 'com.example.test@1.2.3',
      environment: 'production',
      tags: { platform: 'web' },
      contexts: { app: { app_version: '1.2.3' } },
      extra: { level: 3 },
      sdk: { name: 'blacklight.telemetry', settings: { infer_ip: 'never' } },
      exception: { values: [{ type: 'TypeError', value: 'boom' }] },
    });
    expect(event.breadcrumbs?.[0]?.message).toBe('scene battle');
    expect(event).not.toHaveProperty('user');
    expect(event).not.toHaveProperty('request');
    const text = JSON.stringify(event);
    expect(text).not.toContain('alice');
    expect(text).not.toContain('v=3');
    expect(event.exception!.values[0]!.stacktrace!.frames.at(-1)!.filename).toBe(
      'app:///assets/game-abc.js',
    );
  });

  it('remembers a refusal, sends nothing and clears waiting events', async () => {
    const sent = backend(() => 'offline');
    const platform = new WebPlatform('com.example.test');
    const first = await start({ dsn: DSN }, {}, platform);
    await first.api.setConsent(true);
    await first.api.captureMessage('queued');
    await first.api.flush();
    expect(first.api.pending).toBe(1);
    await first.api.setConsent(false);
    expect(first.api.pending).toBe(0);
    await first.host.dispose();

    const second = await start({ dsn: DSN }, {}, platform);
    expect(second.api.consent).toBe('denied');
    expect(await second.api.askConsent({ ask: async () => true })).toBe(false);
    expect(await second.api.track('x')).toBeUndefined();
    expect(sent).toEqual([]);
  });

  it('keeps events offline and sends them when the backend answers again', async () => {
    let state: number | 'offline' = 'offline';
    const sent = backend(() => state);
    const platform = new WebPlatform('com.example.test');
    const first = await start({ dsn: DSN }, {}, platform);
    await first.api.setConsent(true);
    await first.api.track('level-complete', { level: 2 });
    await first.api.flush();
    expect(first.api.pending).toBe(1);
    await first.host.dispose();

    state = 503;
    const second = await start({ dsn: DSN }, {}, platform);
    await second.api.flush();
    expect(second.api.pending).toBe(1);
    state = 200;
    await second.api.flush();
    expect(second.api.pending).toBe(0);
    expect(sent[0]!.event).toMatchObject({ logger: 'telemetry.event', message: 'level-complete' });
  });

  it('drops events the backend refuses and honours sampleRate', async () => {
    const refused = backend(() => 400);
    const { api } = await start();
    await api.setConsent(true);
    await api.captureMessage('bad');
    await api.flush();
    expect(api.pending).toBe(0);
    expect(refused).toEqual([]);

    const sent = backend();
    const sampled = await start({ dsn: DSN, sampleRate: 0 });
    await sampled.api.setConsent(true);
    expect(await sampled.api.captureMessage('never')).toBeUndefined();
    expect(sent).toEqual([]);
  });

  it('asks with a callback, the UI layer or the built-in dialog', async () => {
    backend();
    const viaCallback = await start();
    const ask = vi.fn(async () => true);
    expect(await viaCallback.api.askConsent({ ask })).toBe(true);
    expect(ask).toHaveBeenCalledWith(DEFAULT_CONSENT_TEXTS);
    expect(await viaCallback.api.askConsent({ ask: async () => false })).toBe(true); // already answered

    const confirm = vi.fn(async () => false);
    const viaUi = await start(
      { dsn: DSN, consent: { title: 'Stats?' } },
      { ui: { forScene: () => ({ confirm }) }, scene: {} },
    );
    expect(await viaUi.api.askConsent()).toBe(false);
    expect(confirm).toHaveBeenCalledWith(
      expect.objectContaining({ title: 'Stats?', confirm: DEFAULT_CONSENT_TEXTS.allow }),
    );
    expect(viaUi.api.consent).toBe('denied');

    const viaDialog = await start();
    const answer = viaDialog.api.askConsent();
    await vi.waitFor(() =>
      expect(viaDialog.game.mount.querySelector('[role="dialog"]')).not.toBeNull(),
    );
    const allow = [...viaDialog.game.mount.querySelectorAll('button')].find(
      (b) => b.textContent === DEFAULT_CONSENT_TEXTS.allow,
    )!;
    expect(document.activeElement).toBe(allow);
    allow.click();
    expect(await answer).toBe(true);
    expect(viaDialog.game.mount.querySelector('[role="dialog"]')).toBeNull();
  });

  it('closes the dialog with Escape', async () => {
    const mount = document.createElement('div');
    document.body.append(mount);
    const answer = consentDialog(mount, DEFAULT_CONSENT_TEXTS);
    mount
      .querySelector('[role="dialog"]')!
      .dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    expect(await answer).toBe(false);
    expect(mount.children).toHaveLength(0);
  });

  it('captures uncaught errors and rejections only with consent', async () => {
    const sent = backend();
    const { api } = await start();
    window.dispatchEvent(
      new ErrorEvent('error', { error: new Error('before'), message: 'before' }),
    );
    await api.flush();
    expect(sent).toEqual([]);

    await api.setConsent(true);
    window.dispatchEvent(new ErrorEvent('error', { error: new Error('crash'), message: 'crash' }));
    window.dispatchEvent(
      Object.assign(new Event('unhandledrejection'), { reason: 'lost promise' }),
    );
    await vi.waitFor(async () => {
      await api.flush();
      expect(sent.map((s) => s.event.exception?.values[0]?.value)).toEqual([
        'crash',
        'lost promise',
      ]);
    });
  });
});
