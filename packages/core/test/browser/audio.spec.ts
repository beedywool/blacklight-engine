import { afterEach, describe, expect, it, vi } from 'vitest';
import { AssetStore } from '../../src/assets';
import { AudioManager } from '../../src/audio';
import { Settings } from '../../src/settings';
import { fileUrl, wavUrl } from './helpers';

const managers: AudioManager[] = [];
afterEach(async () => {
  for (const manager of managers.splice(0)) await manager.ctx.close();
});

async function setup(files: Record<string, string>, settings?: Settings) {
  const assets = new AssetStore({ files });
  const audio = new AudioManager(assets, settings);
  managers.push(audio);
  await assets.load(Object.keys(files));
  return { assets, audio };
}

describe('AudioManager (Web Audio)', () => {
  it('decodes loaded files and plays them by key on a bus', async () => {
    const { audio } = await setup({ 'assets/sfx/coin.wav': wavUrl() });
    const played = vi.fn();
    audio.events.on('play', played);
    const handle = audio.play('coin', { bus: 'ui', volume: 0.5, rate: 2 });
    expect(handle.key).toBe('coin');
    expect(played).toHaveBeenCalledWith({ key: 'coin', bus: 'ui' });
    expect(audio.history).toEqual(['coin']);
    await audio.ctx.resume();
    expect(audio.unlocked).toBe(true);
    // A 50 ms sound at double rate ends on its own.
    await handle.ended;
  });

  it('says how to preload a sound that is not loaded', async () => {
    const assets = new AssetStore({ files: { 'assets/sfx/jump.wav': wavUrl() } });
    const audio = new AudioManager(assets);
    managers.push(audio);
    expect(() => audio.play('jump')).toThrow(
      'Sound "jump" (assets/sfx/jump.wav) is not loaded. Add it to the scene\'s `static assets`.',
    );
    expect(() => audio.play('jmup')).toThrow(/No asset named "jmup". Did you mean "jump"\?/);
  });

  it('skips a format the browser cannot decode and plays another one of the same sound', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const { audio } = await setup({
      'assets/sfx/hit.ogg': fileUrl('not audio', 'audio/ogg'),
      'assets/sfx/hit.wav': wavUrl(),
    });
    expect(warn).toHaveBeenCalledWith(
      expect.stringContaining('Cannot decode assets/sfx/hit.ogg in this browser'),
      expect.anything(),
    );
    expect(audio.play('hit').key).toBe('hit');
    warn.mockRestore();
  });

  it('keeps only the last 50 sounds in the history', async () => {
    const { audio } = await setup({ 'assets/sfx/tick.wav': wavUrl(0.01) });
    for (let i = 0; i < 55; i++) audio.play('tick');
    expect(audio.history).toHaveLength(50);
  });

  it('stops sounds, with or without a fade, and changes their volume', async () => {
    const { audio } = await setup({ 'assets/music/theme.wav': wavUrl(2) });
    await audio.ctx.resume();
    const looped = audio.play('theme', { loop: true, loopStart: 0.1, loopEnd: 0.5, fade: 20 });
    looped.setVolume(0.2, 10);
    looped.stop(20);
    await looped.ended;
    const plain = audio.play('theme');
    plain.stop();
    await plain.ended;
  });

  it('cross-fades music and does not restart the track already playing', async () => {
    const { audio } = await setup({
      'assets/music/calm.wav': wavUrl(1),
      'assets/music/battle.wav': wavUrl(1),
    });
    const changes: (string | undefined)[] = [];
    audio.events.on('music', ({ key }) => changes.push(key));
    const calm = audio.music('calm', { fade: 50 });
    expect(audio.music('calm')).toBe(calm);
    audio.music('battle', { fade: 50 });
    expect(audio.currentMusic).toBe('battle');
    audio.stopMusic({ fade: 10 });
    expect(audio.currentMusic).toBeUndefined();
    expect(changes).toEqual(['calm', 'battle', undefined]);
  });

  it('pans and attenuates positioned sounds with the distance to the listener', async () => {
    const { audio } = await setup({ 'assets/sfx/step.wav': wavUrl(1) });
    const panners: StereoPannerNode[] = [];
    const create = AudioContext.prototype.createStereoPanner;
    vi.spyOn(AudioContext.prototype, 'createStereoPanner').mockImplementation(function (
      this: AudioContext,
    ) {
      const panner = create.call(this);
      panners.push(panner);
      return panner;
    });
    const handle = audio.play('step', { at: { x: 300, y: 0 }, range: 600 });
    const panner = panners[0]!;
    // 300 px to the right with a 600 px range: fully right.
    expect(panner.pan.value).toBe(1);
    audio.updateListener({ x: 300, y: 0 });
    expect(panner.pan.value).toBe(0);
    handle.setPosition({ x: 150, y: 0 });
    expect(panner.pan.value).toBe(-0.5);
    audio.updateListener({ x: 150 + 600, y: 0 });
    expect(panner.pan.value).toBe(-1);
    vi.restoreAllMocks();
    handle.stop();
  });

  it('saves bus volumes in the settings, clamped to 0–2', async () => {
    localStorage.removeItem('test:audio');
    const settings = new Settings('test:audio');
    const { audio } = await setup({ 'assets/sfx/coin.wav': wavUrl() }, settings);
    expect(audio.volume('music')).toBe(0.8);
    void audio.ctx; // the buses exist: the change also applies to the running graph
    expect(audio.volume('music', 5)).toBe(2);
    expect(audio.volume('sfx', -1)).toBe(0);
    const again = new AudioManager(new AssetStore(), new Settings('test:audio'));
    expect(again.volume('music')).toBe(2);
    expect(again.volume('sfx')).toBe(0);
    expect(again.volume('master')).toBe(1);
  });

  it('suspends everything on blur, and only game buses for pause menus', async () => {
    const { audio } = await setup({ 'assets/sfx/coin.wav': wavUrl() });
    audio.setPaused(true); // no context yet: nothing to do
    await audio.ctx.resume();
    audio.setPaused(true);
    await vi.waitFor(() => expect(audio.ctx.state).toBe('suspended'));
    audio.setPaused(false);
    await vi.waitFor(() => expect(audio.ctx.state).toBe('running'));
    audio.setPaused(true, { ui: true });
    // UI sounds keep playing in pause menus: the context stays running.
    expect(audio.ctx.state).toBe('running');
    audio.setPaused(false, { ui: true });
  });

  it('unlocks the context on the first key press, then stops listening', async () => {
    const { audio } = await setup({});
    const target = new EventTarget();
    audio.attach(target);
    await audio.ctx.suspend();
    expect(audio.unlocked).toBe(false);
    target.dispatchEvent(new Event('keydown'));
    await vi.waitFor(() => expect(audio.unlocked).toBe(true));
    await audio.ctx.suspend();
    target.dispatchEvent(new Event('pointerdown'));
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(audio.unlocked).toBe(false);
  });
});
