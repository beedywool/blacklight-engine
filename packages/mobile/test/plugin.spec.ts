import { InputManager, WebPlatform, type Game } from '@blacklight/core';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { MobilePlatform } from '../src/platform';
import { mobile, resolveMobileConfig } from '../src/plugin';
import { fakeDevice } from './fakes';

function fakeGame(mobileConfig?: object) {
  const input = new InputManager({}, undefined, () => []);
  return {
    config: {
      id: 'com.example.test',
      resolution: { width: 1920, height: 1080, mode: 'extend', pixelArt: false },
      mobile: mobileConfig,
    },
    input,
    platform: new WebPlatform('com.example.test'),
  } as unknown as Game;
}

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe('resolveMobileConfig', () => {
  it('derives the orientation from the design resolution', () => {
    expect(resolveMobileConfig({ resolution: { width: 1920, height: 1080 } })).toEqual({
      orientation: 'landscape',
      statusBar: 'hidden',
      keepAwake: true,
      gameCenter: false,
      playGamesAppId: undefined,
    });
    expect(resolveMobileConfig({ resolution: { width: 1080, height: 1920 } }).orientation).toBe(
      'portrait',
    );
    expect(
      resolveMobileConfig({
        resolution: { width: 1080, height: 1920 },
        mobile: { orientation: 'any', statusBar: 'visible', keepAwake: false },
      }),
    ).toMatchObject({ orientation: 'any', statusBar: 'visible', keepAwake: false });
  });
});

describe('mobile() plugin', () => {
  it('does nothing in a browser', async () => {
    const game = fakeGame();
    const before = game.platform;
    await mobile()(game);
    expect(game.platform).toBe(before);
  });

  it('installs the platform, keeps the screen on and hides the system bars', async () => {
    const device = fakeDevice();
    const game = fakeGame();
    await mobile({ plugins: device.plugins })(game);
    expect(game.platform).toBeInstanceOf(MobilePlatform);
    expect(game.platform.name).toBe('android');
    expect(game.platform.files.location).toMatch(/files\/blacklight$/);
    expect(device.calls.map(([name]) => name)).toEqual(['keepAwake.keepAwake', 'systemBars.hide']);

    const quiet = fakeDevice();
    await mobile({ plugins: quiet.plugins })(fakeGame({ statusBar: 'visible', keepAwake: false }));
    expect(quiet.calls).toEqual([]);
  });

  it('presses the back action for one step when the Android back button is pressed', async () => {
    vi.useFakeTimers();
    const device = fakeDevice();
    const game = fakeGame();
    await mobile({ plugins: device.plugins })(game);
    const seen: unknown[] = [];
    game.platform.on('back', () => seen.push('back'));

    device.fire('backButton', { canGoBack: false });
    game.input.update();
    expect(game.input.pressed('back')).toBe(true);
    game.input.update();
    expect(game.input.pressed('back')).toBe(false);
    expect(game.input.held('back')).toBe(true);
    vi.advanceTimersByTime(150);
    game.input.update();
    expect(game.input.released('back')).toBe(true);
    expect(game.input.player(1).virtual.has('back')).toBe(false);
    expect(seen).toEqual(['back']);
  });

  it('gives each of two quick back presses its own press', async () => {
    vi.useFakeTimers();
    const device = fakeDevice();
    const game = fakeGame();
    await mobile({ plugins: device.plugins })(game);
    let presses = 0;
    const step = () => {
      game.input.update();
      if (game.input.pressed('back')) presses++;
      vi.advanceTimersByTime(1000 / 60);
    };
    device.fire('backButton', { canGoBack: false });
    step();
    device.fire('backButton', { canGoBack: false });
    device.fire('backButton', { canGoBack: false });
    for (let i = 0; i < 60; i++) step();
    expect(presses).toBe(3);
    expect(game.input.player(1).virtual.has('back')).toBe(false);
  });

  it('keeps a back press down until the game has read it (slow frames)', async () => {
    vi.useFakeTimers();
    const device = fakeDevice();
    const game = fakeGame();
    await mobile({ plugins: device.plugins })(game);
    device.fire('backButton', { canGoBack: false });
    device.fire('backButton', { canGoBack: false });
    // No frame for 500 ms: both taps are still waiting, the first one down.
    vi.advanceTimersByTime(500);
    expect(game.input.player(1).virtual.get('back')).toBe(1);
    let presses = 0;
    for (let i = 0; i < 6; i++) {
      // One slow frame (one input read) every 250 ms.
      game.input.update();
      if (game.input.pressed('back')) presses++;
      vi.advanceTimersByTime(250);
    }
    expect(presses).toBe(2);
    expect(game.input.player(1).virtual.has('back')).toBe(false);
  });

  it('counts a back press that lands right as the previous one is released', async () => {
    vi.useFakeTimers();
    const device = fakeDevice();
    const game = fakeGame();
    await mobile({ plugins: device.plugins })(game);
    let presses = 0;
    const step = () => {
      game.input.update();
      if (game.input.pressed('back')) presses++;
    };
    device.fire('backButton', { canGoBack: false });
    step();
    // The first tap is released; the second arrives before the input is read again.
    vi.advanceTimersByTime(100);
    expect(game.input.player(1).virtual.has('back')).toBe(false);
    device.fire('backButton', { canGoBack: false });
    for (let i = 0; i < 30; i++) {
      step();
      vi.advanceTimersByTime(1000 / 60);
    }
    expect(presses).toBe(2);
  });

  it('stops the game in the background and restores the bars on return', async () => {
    const dispatch = vi.fn();
    vi.stubGlobal('dispatchEvent', dispatch);
    const device = fakeDevice();
    await mobile({ plugins: device.plugins })(fakeGame());
    device.calls.length = 0;
    device.fire('pause');
    device.fire('resume');
    expect(dispatch.mock.calls.map(([event]) => (event as Event).type)).toEqual(['blur', 'focus']);
    expect(device.calls.map(([name]) => name)).toEqual(['systemBars.hide']);
  });

  it('starts even when keep-awake or system bars fail', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const device = fakeDevice();
    device.plugins.keepAwake.keepAwake = () => Promise.reject(new Error('not supported'));
    const game = fakeGame();
    await mobile({ plugins: device.plugins })(game);
    expect(game.platform).toBeInstanceOf(MobilePlatform);
    expect(warn).toHaveBeenCalledWith('@blacklight/mobile:', expect.any(Error));
    warn.mockRestore();
  });
});
