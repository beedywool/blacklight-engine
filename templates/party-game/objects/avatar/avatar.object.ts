// @blacklight-deterministic
import { Graphics } from '@blacklight/core';
import Referee from '@objects/referee/referee.object';
import { direction } from '../../party/geometry';
import { AVATAR_RADIUS } from '../../party/rules';
import { drawSkin } from '../../party/skins';

/**
 * A player's body in a mini-game: skin, facing, shield bubble. Mini-games extend it with their
 * own rules (scene-local objects). Everything that changes the game happens in `update`; the
 * look follows the state in `refresh`, which only touches the inner drawing (snapshots and
 * checksums never see it).
 */
export default class Avatar extends Graphics {
  static override hitbox = 'none' as const;

  skin = 0;
  radius = AVATAR_RADIUS;
  /** Direction the player faces, radians. */
  facing = 0;
  /** Steps of blinking left (after a hit). */
  blink = 0;
  #drawn = '';

  override create(): void {
    this.refresh();
  }

  override onRestore(): void {
    this.#drawn = '';
    this.refresh();
  }

  get referee(): Referee {
    return this.scene.find(Referee)!;
  }

  /** The mini-game runs and this player is still in. */
  get controllable(): boolean {
    const referee = this.referee;
    return referee.playing && !referee.isOut(this.player);
  }

  get shielded(): boolean {
    return this.referee.shielded(this.player);
  }

  /** Direction held by this player (zero while the controls are locked). */
  heading(): { x: number; y: number } {
    if (!this.controllable) return { x: 0, y: 0 };
    return direction(this.input);
  }

  override update(): void {
    if (this.blink > 0) this.blink--;
  }

  /** Redraws when the look changed. Called once per displayed frame by the mini-game scene. */
  refresh(): void {
    const shield = this.alive && this.referee?.shielded(this.player);
    const key = `${this.skin}:${Math.round(this.facing * 4)}:${this.radius}:${shield}`;
    this.draw.alpha = this.blink > 0 && this.blink % 8 < 4 ? 0.35 : 1;
    if (key === this.#drawn) return;
    this.#drawn = key;
    this.draw.clear();
    if (shield) {
      this.draw
        .circle(0, 0, this.radius + 16)
        .fill({ color: 0x7ad7ff, alpha: 0.25 })
        .stroke({ width: 5, color: 0x7ad7ff });
    }
    drawSkin(this.draw, this.skin, this.radius, this.facing);
  }
}
