import { Graphics, behaviors, type ActionName } from '@blacklight/core';

const RADIUS = 64;

interface Button {
  action: ActionName;
  x: number;
  y: number;
  radius: number;
  touch?: number;
}

/**
 * On-screen controls for phones and tablets, in the `hud` layer: a virtual joystick on the left
 * half (left / right) and jump and pause buttons on the right. They feed the same actions as the
 * keyboard and gamepads, so the hero's `platformer` behavior needs no touch code. Shown once the
 * player touches the screen, hidden again when a key or a gamepad is used.
 */
export default class TouchControls extends Graphics {
  private buttons: Button[] = [];

  override create() {
    // The joystick is a behavior on a child object: it moves to where the thumb lands.
    this.scene
      .spawn(Graphics, { layer: 'hud', parent: this })
      .addBehavior(behaviors.virtualJoystick({ radius: 70 })());
    this.layout();
    this.visible =
      this.game.input.lastDevice === 'touch' || matchMedia('(pointer: coarse)').matches;
    this.disposables.add(this.game.events.on('resize', () => this.layout()));
    this.disposables.add(
      this.game.input.events.on('device', (device) => (this.visible = device === 'touch')),
    );
  }

  /** Buttons at the right edge of the visible area (wider than 1280 on long phones). */
  private layout() {
    const { visibleWidth } = this.game.viewport;
    const right = this.scene.width + (visibleWidth - this.scene.width) / 2;
    const bottom = this.scene.height;
    this.buttons = [
      { action: 'jump', x: right - 130, y: bottom - 130, radius: RADIUS },
      { action: 'pause', x: right - 70, y: 70, radius: RADIUS * 0.6 },
    ];
    this.redraw();
  }

  private redraw() {
    const g = this.draw.clear();
    for (const button of this.buttons) {
      const alpha = button.touch === undefined ? 0.35 : 0.65;
      g.circle(button.x, button.y, button.radius).fill({ color: 0xffffff, alpha: alpha * 0.4 });
      g.circle(button.x, button.y, button.radius).stroke({ color: 0xffffff, alpha, width: 4 });
      if (button.action === 'jump') {
        const s = button.radius * 0.45;
        g.poly([
          button.x - s,
          button.y + s * 0.5,
          button.x,
          button.y - s,
          button.x + s,
          button.y + s * 0.5,
        ]).fill({ color: 0xffffff, alpha });
      } else {
        const s = button.radius * 0.35;
        g.rect(button.x - s, button.y - s, s * 0.7, s * 2).fill({ color: 0xffffff, alpha });
        g.rect(button.x + s * 0.3, button.y - s, s * 0.7, s * 2).fill({ color: 0xffffff, alpha });
      }
    }
  }

  override update() {
    const { touches } = this.game.input;
    const virtual = this.game.input.player(1).virtual;
    let changed = false;
    for (const button of this.buttons) {
      if (button.touch !== undefined && !touches.has(button.touch)) {
        button.touch = undefined;
        virtual.delete(button.action);
        changed = true;
      }
      if (button.touch === undefined) {
        for (const [id, point] of touches) {
          if (Math.hypot(point.x - button.x, point.y - button.y) <= button.radius * 1.25) {
            button.touch = id;
            virtual.set(button.action, 1);
            changed = true;
            break;
          }
        }
      }
    }
    if (changed) this.redraw();
  }
}
