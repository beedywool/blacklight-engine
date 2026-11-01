import { Graphics as PixiGraphics } from 'pixi.js';
import { describe, expect, it, vi } from 'vitest';
import { installDebug } from '../../src/debug/index';
import { GameObject } from '../../src/objects/game-object';
import { Scene } from '../../src/scene';
import { Empty, scenes, startGame, until } from './helpers';

const press = (code: string) => {
  const event = new KeyboardEvent('keydown', { code, cancelable: true });
  window.dispatchEvent(event);
  return event;
};

class Ball extends GameObject {
  static override hitbox = { type: 'circle' as const, radius: 5 };
}
class Wall extends GameObject {
  static override hitbox = { type: 'box' as const, width: 10, height: 10 };
  static override collision = { solid: true };
}
class Ramp extends GameObject {
  static override hitbox = {
    type: 'polygon' as const,
    points: [
      [0, 0],
      [10, 0],
      [0, 10],
    ] as [number, number][],
  };
}

class Room extends Scene {
  override create(): void {
    this.spawn(Ball, { x: 50, y: 50 });
    this.spawn(Ball, { x: 60, y: 50 });
    this.spawn(Wall, { x: 100, y: 100 });
    this.add(new Ramp());
    this.hud.addChild(this.add(new Ball()));
  }
}

describe('installDebug', () => {
  it('toggles the overlay, hitboxes, pause, single steps and slow motion with function keys', async () => {
    const info = vi.spyOn(console, 'info').mockImplementation(() => {});
    const game = await startGame({ scenes: scenes({ main: Room, pause: Empty }) });
    const remove = installDebug(game);
    expect(info).toHaveBeenCalledWith(expect.stringContaining('F3 overlay'));
    const panel = document.body.lastElementChild as HTMLPreElement;
    expect(panel.style.display).toBe('none');

    // Unrelated keys are left to the game.
    expect(press('F9').defaultPrevented).toBe(false);
    expect(press('F3').defaultPrevented).toBe(true);
    expect(panel.style.display).toBe('block');
    await game.overlay('pause' as never, undefined, { pauseBelow: false });
    game.audio.history.push('coin');
    // The overlay is written by a ticker listener, and Pixi's ticker skips its listeners on an
    // animation frame whose timestamp is not later than the last one: a fixed number of frames
    // does not guarantee an update (run 41322614717, Windows). Wait for the state instead.
    await until(() => panel.textContent.includes('scene main + pause'));
    expect(panel.textContent).toContain('Ball ×3');
    expect(panel.textContent).toContain('sounds coin');

    press('F4');
    const hitboxes = game.app.stage.children.find(
      (c) => c instanceof PixiGraphics && c.parent === game.app.stage,
    ) as PixiGraphics;
    await until(() => hitboxes.bounds.width > 0);

    press('F6');
    expect(game.paused).toBe(true);
    await until(() => panel.textContent.includes('PAUSED'));
    press('F6');
    expect(game.paused).toBe(false);

    const step = game.time.step;
    press('F7');
    expect(game.paused).toBe(true);
    expect(game.time.step).toBe(step + 1);
    press('F7');
    expect(game.time.step).toBe(step + 2);

    press('F8');
    expect(game.time.scale).toBe(0.25);
    press('F8');
    expect(game.time.scale).toBe(1);

    remove();
    expect(panel.isConnected).toBe(false);
    press('F6');
    expect(game.paused).toBe(true); // still paused from F7: F6 no longer listened to
    info.mockRestore();
  });
});
