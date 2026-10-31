import { afterEach, describe, expect, it, vi } from 'vitest';
import { InputManager } from '../../src/input/input';
import { WebPlatform } from '../../src/platform';
import { Settings } from '../../src/settings';

describe('InputManager.attach (DOM events)', () => {
  const cleanup: (() => void)[] = [];
  afterEach(() => {
    for (const run of cleanup.splice(0)) run();
  });

  function attached() {
    const input = new InputManager(
      { actions: { jump: ['Space'], fire: ['Mouse:Left'], back: ['Escape'], left: ['KeyA'] } },
      undefined,
      () => [],
    );
    const target = document.createElement('div');
    document.body.append(target);
    const detach = input.attach(target, (x, y) => ({ x: x / 2, y: y / 2 }));
    cleanup.push(detach, () => target.remove());
    return { input, target, detach };
  }

  const key = (type: 'keydown' | 'keyup', code: string, key = code, at: EventTarget = window) => {
    const event = new KeyboardEvent(type, { code, key, cancelable: true, bubbles: true });
    at.dispatchEvent(event);
    return event;
  };

  it('feeds keys to actions and keeps bound keys from scrolling the page', () => {
    const { input } = attached();
    expect(key('keydown', 'Space', ' ').defaultPrevented).toBe(true);
    // KeyQ is bound by default (tabLeft); KeyG is not.
    expect(key('keydown', 'KeyG', 'g').defaultPrevented).toBe(false);
    input.update();
    expect(input.pressed('jump' as never)).toBe(true);
    key('keyup', 'Space', ' ');
    input.update();
    expect(input.released('jump' as never)).toBe(true);
    expect(input.lastDevice).toBe('keyboard');
  });

  it('leaves letters to text fields but lets named keys through to menus', () => {
    const { input } = attached();
    const field = document.createElement('input');
    document.body.append(field);
    cleanup.push(() => field.remove());
    expect(key('keydown', 'KeyA', 'a', field).defaultPrevented).toBe(false);
    key('keydown', 'Escape', 'Escape', field);
    input.update();
    expect(input.held('left' as never)).toBe(false);
    expect(input.pressed('back' as never)).toBe(true);
  });

  it('converts pointer events to virtual pixels and maps mouse buttons', () => {
    const { input, target } = attached();
    const pointer = (type: string, x: number, y: number) =>
      target.dispatchEvent(
        new PointerEvent(type, {
          clientX: x,
          clientY: y,
          button: 0,
          pointerId: 1,
          pointerType: 'mouse',
          bubbles: true,
        }),
      );
    pointer('pointermove', 100, 60);
    expect([input.pointer.x, input.pointer.y]).toEqual([50, 30]);
    pointer('pointerdown', 100, 60);
    input.update();
    expect(input.pressed('fire' as never)).toBe(true);
    expect(input.pointer.down).toBe(true);
    pointer('pointerup', 120, 60);
    input.update();
    expect(input.released('fire' as never)).toBe(true);
    expect(input.pointer.x).toBe(60);

    const menu = new MouseEvent('contextmenu', { cancelable: true, bubbles: true });
    target.dispatchEvent(menu);
    expect(menu.defaultPrevented).toBe(true);
    expect(target.style.touchAction).toBe('none');
  });

  it('releases everything when the window loses focus, and stops listening once detached', () => {
    const { input, target, detach } = attached();
    key('keydown', 'Space', ' ');
    input.update();
    expect(input.held('jump' as never)).toBe(true);
    // The keyup is lost when the window loses focus.
    window.dispatchEvent(new Event('blur'));
    input.update();
    expect(input.held('jump' as never)).toBe(false);

    detach();
    key('keydown', 'Space', ' ');
    target.dispatchEvent(new PointerEvent('pointerdown', { pointerId: 1, button: 0 }));
    input.update();
    expect(input.held('jump' as never)).toBe(false);
    expect(input.held('fire' as never)).toBe(false);
  });
});

describe('WebPlatform (IndexedDB)', () => {
  const id = () => `com.blacklight.test${Math.random().toString(36).slice(2)}`;

  it('keeps files across instances of the same game, and apart from other games', async () => {
    const gameId = id();
    const first = new WebPlatform(gameId);
    await first.files.write('saves/1.sav', new Uint8Array([1, 2, 3]));
    await first.files.write('saves/2.sav', new Uint8Array([4]));
    await first.files.write('settings.json', new Uint8Array([5]));

    const again = new WebPlatform(gameId);
    expect(await again.files.read('saves/1.sav')).toEqual(new Uint8Array([1, 2, 3]));
    expect(await again.files.list('saves/')).toEqual(['saves/1.sav', 'saves/2.sav']);
    await again.files.remove('saves/1.sav');
    expect(await first.files.read('saves/1.sav')).toBeUndefined();
    expect(await first.files.list()).toEqual(['saves/2.sav', 'settings.json']);

    expect(await new WebPlatform(id()).files.list()).toEqual([]);
  });

  it('keeps one non-extractable save key per game', async () => {
    const gameId = id();
    const key = await new WebPlatform(gameId).saveKey();
    expect(key.extractable).toBe(false);
    expect(key.algorithm.name).toBe('AES-GCM');
    // Saves written by one session must be readable by the next: the same key comes back.
    const again = await new WebPlatform(gameId).saveKey();
    const iv = new Uint8Array(12);
    const sealed = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, new Uint8Array([7]));
    const opened = await crypto.subtle.decrypt({ name: 'AES-GCM', iv }, again, sealed);
    expect(new Uint8Array(opened)).toEqual(new Uint8Array([7]));
  });

  it('answers native calls with web fallbacks and explains the missing ones', async () => {
    const platform = new WebPlatform(id());
    platform.registerFallback('clipboard', { read: async () => 'copied' });
    expect(await platform.invoke('clipboard', 'read')).toBe('copied');
    await expect(platform.invoke('steam', 'unlock', 'WIN')).rejects.toThrow(
      '"steam.unlock" is not available on the web: it needs the desktop or mobile app.',
    );
    const listener = vi.fn();
    const off = platform.on('resume', listener);
    platform.emit('resume');
    off();
    platform.emit('resume');
    expect(listener).toHaveBeenCalledTimes(1);
  });

  it('opens links in a new tab without giving it access to the game', async () => {
    const open = vi.spyOn(window, 'open').mockReturnValue(null);
    await new WebPlatform(id()).openUrl('https://example.com/');
    expect(open).toHaveBeenCalledWith('https://example.com/', '_blank', 'noopener');
    open.mockRestore();
  });
});

describe('Settings (localStorage)', () => {
  it('keeps values between sessions and removes them on delete', () => {
    localStorage.removeItem('test:settings');
    const settings = new Settings('test:settings');
    expect(settings.get('subtitles')).toBeUndefined();
    settings.set('subtitles', true);
    settings.set('language', 'fr');
    expect(new Settings('test:settings').get('subtitles')).toBe(true);
    settings.delete('subtitles');
    const again = new Settings('test:settings');
    expect(again.get('subtitles')).toBeUndefined();
    expect(again.get('language')).toBe('fr');
  });

  it('starts empty when the stored settings are not JSON', () => {
    localStorage.setItem('test:broken', '{oops');
    expect(new Settings('test:broken').get('anything')).toBeUndefined();
  });

  it('keeps settings for the session when storage refuses to write', () => {
    const setItem = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new DOMException('Quota exceeded', 'QuotaExceededError');
    });
    const settings = new Settings('test:full');
    settings.set('volume', 0.5);
    expect(settings.get('volume')).toBe(0.5);
    setItem.mockRestore();
  });
});
