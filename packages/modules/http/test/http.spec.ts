import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { afterEach, describe, expect, it } from 'vitest';
import { ModuleHost, WebPlatform, type Game } from '@blacklight/core';
import { HttpError, OfflineError, http, type Http } from '../src/index';

let server: Server | undefined;
let hosts: ModuleHost[] = [];
afterEach(async () => {
  for (const host of hosts) await host.dispose();
  hosts = [];
  await new Promise<void>((resolve) => (server ? server.close(() => resolve()) : resolve()));
  server = undefined;
});

interface Received {
  method: string;
  url: string;
  body: string;
  authorization?: string;
}

/** A test server; `status` decides each answer. */
async function serve(
  status: (req: Received) => number,
): Promise<{ url: string; received: Received[] }> {
  const received: Received[] = [];
  server = createServer(async (req, res) => {
    let body = '';
    for await (const chunk of req) body += String(chunk);
    const entry = {
      method: req.method!,
      url: req.url!,
      body,
      authorization: req.headers.authorization,
    };
    received.push(entry);
    const code = status(entry);
    res.writeHead(code, { 'content-type': 'application/json' });
    res.end(JSON.stringify(code < 400 ? { ok: true, echo: body } : { message: 'nope' }));
  });
  await new Promise<void>((resolve) => server!.listen(0, resolve));
  return { url: `http://localhost:${(server!.address() as AddressInfo).port}`, received };
}

async function start(config: object, platform = new WebPlatform('test')): Promise<Http> {
  const game = { config: { modules: { http: config } }, platform } as unknown as Game;
  const host = new ModuleHost(game);
  hosts.push(host);
  await host.install({ definitions: [http] });
  return host.apis.http as Http;
}

describe('http module', () => {
  it('sends JSON, parses answers and adds authorization per server', async () => {
    const { url, received } = await serve(() => 200);
    const api = await start({ baseUrl: url });
    api.authorize(url, () => 'Bearer abc');
    const data = await api.post<{ echo: string }>(
      '/scores',
      { points: 3 },
      { query: { mode: 'vs' } },
    );
    expect(data.echo).toBe('{"points":3}');
    expect(received[0]).toMatchObject({
      method: 'POST',
      url: '/scores?mode=vs',
      authorization: 'Bearer abc',
    });
    expect(await api.get('/x', { auth: false })).toEqual({ ok: true, echo: '' });
    expect(received[1]!.authorization).toBeUndefined();
  });

  it('throws HttpError with the status and OfflineError when unreachable', async () => {
    const { url } = await serve(() => 404);
    const api = await start({ baseUrl: url });
    await expect(api.get('/missing')).rejects.toBeInstanceOf(HttpError);
    await expect(api.get('/missing')).rejects.toThrow('answered HTTP 404: nope');
    await expect(api.get('http://localhost:1/none')).rejects.toBeInstanceOf(OfflineError);
    expect(api.online).toBe(false);
  });

  it('explains how to fix a relative URL without baseUrl', async () => {
    const api = await start({});
    await expect(api.get('/scores')).rejects.toThrow(/modules.http.baseUrl/);
  });

  it('queues requests while the server is down and replays them in order after a restart', async () => {
    const platform = new WebPlatform('test');
    let up = false;
    const { url, received } = await serve(() => (up ? 200 : 503));
    const first = await start({ baseUrl: url, retryDelay: 60_000 }, platform);
    await first.send('/events', { json: { n: 1 } });
    await first.send('/events', { json: { n: 2 } });
    await first.flush();
    expect(first.pending).toBe(2);
    await hosts.pop()!.dispose(); // the game closes with two requests waiting

    up = true;
    const second = await start({ baseUrl: url, retryDelay: 60_000 }, platform);
    const drained = new Promise<void>((resolve) => second.on('drained', resolve));
    await second.flush();
    await drained;
    expect(second.pending).toBe(0);
    const delivered = received.filter((r) => r.method === 'POST' && up).map((r) => r.body);
    expect(delivered.slice(-2)).toEqual(['{"n":1}', '{"n":2}']);
  });

  it('drops queued requests the server refuses', async () => {
    const { url } = await serve(() => 400);
    const api = await start({ baseUrl: url });
    const failed = new Promise<boolean>((resolve) => api.on('failed', (e) => resolve(e.willRetry)));
    await api.send('/bad', { json: {} });
    expect(await failed).toBe(false);
    await api.flush();
    expect(api.pending).toBe(0);
  });

  it('checks its options', async () => {
    await expect(start({ baseUrl: 'not a url', timeout: -1 })).rejects.toThrow(
      /`modules.http.baseUrl` must be a string holding an http\(s\) URL[\s\S]*`modules.http.timeout` must be a number >= 1/,
    );
  });
});
