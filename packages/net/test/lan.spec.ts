import { describe, expect, it } from 'vitest';
import { WebPlatform, type Game } from '@blacklight/core';
import { hostLan, stopLan, type LanRelay } from '../src/lan';

const gameOn = (platform: WebPlatform) => ({ platform }) as unknown as Game;

describe('LAN hosting (NET-01)', () => {
  it('starts and stops the relay through the platform', async () => {
    const platform = new WebPlatform('com.test.lan');
    const calls: unknown[][] = [];
    const lan: LanRelay = {
      port: 5360,
      urls: ['ws://192.168.1.20:5360'],
      local: 'ws://127.0.0.1:5360',
    };
    platform.registerFallback('relay', {
      start: (options) => {
        calls.push(['start', options]);
        return lan;
      },
      stop: () => void calls.push(['stop']),
    });
    expect(await hostLan(gameOn(platform), { port: 5360 })).toEqual(lan);
    await stopLan(gameOn(platform));
    expect(calls).toEqual([['start', { port: 5360 }], ['stop']]);
  });

  it('explains that the web cannot host and how to connect instead', async () => {
    const error = await hostLan(gameOn(new WebPlatform('com.test.lan'))).catch((e: Error) => e);
    expect(error).toBeInstanceOf(Error);
    expect((error as Error).message).toMatch(
      /^LAN hosting needs the desktop app \(platform "web" has no "relay" native module\): .*"relay\.start" is not available on the web.*RelayClient\.connect\(url\)\.$/,
    );
    expect((error as Error).cause).toBeInstanceOf(Error);
  });
});
