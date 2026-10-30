// @blacklight-deterministic
import { Graphics } from '@blacklight/core';
import Referee from '@objects/referee/referee.object';
import { FLOOR_Y, LANDING_Y, MIDDLE, UPPER } from '../../rules';
import type DoorReferee from '../door-referee/door-referee.object';

/**
 * The doors and the cloud, drawn from the referee's state each frame (display only: no state of
 * its own, so nothing here can desynchronize online players).
 */
export default class Storm extends Graphics {
  static override hitbox = 'none' as const;
  static override serialize: string[] = [];
  #drawn = '';

  refresh(): void {
    const referee = this.scene.find(Referee) as DoorReferee | undefined;
    if (!referee) return;
    const open = referee.playing && referee.stage !== 'choose';
    const side = referee.strikeSide;
    const flash = referee.stage === 'strike' && referee.stageClock % 10 < 5;
    const key = `${open}:${side}:${flash}:${referee.stage}`;
    if (key === this.#drawn) return;
    this.#drawn = key;
    const pen = this.draw;
    pen.clear();
    // Two doors in the floor; open ones are dark holes.
    for (const s of [0, 1]) {
      const x = s === 0 ? UPPER.left : MIDDLE + 10;
      const width = MIDDLE - 10 - UPPER.left;
      pen.rect(x, FLOOR_Y - 20, width, 40).fill(open ? 0x0a0a0a : 0x8b5a2b);
      if (!open) pen.rect(x + width / 2 - 3, FLOOR_Y - 20, 6, 40).fill(0x5a3a1a);
    }
    if (side < 0) return;
    const cx = side === 0 ? (UPPER.left + MIDDLE) / 2 : (MIDDLE + UPPER.right) / 2;
    const cy = FLOOR_Y + 90;
    const color = referee.stage === 'strike' ? 0x3b3b52 : 0x6f7390;
    for (const [dx, dy, r] of [
      [-180, 10, 70],
      [-90, -20, 90],
      [10, -30, 100],
      [110, -10, 85],
      [190, 15, 60],
    ] as const) {
      pen.circle(cx + dx, cy + dy, r).fill(color);
    }
    if (flash) {
      pen
        .poly([
          cx - 30,
          cy + 60,
          cx + 20,
          cy + 60,
          cx - 10,
          cy + 160,
          cx + 40,
          cy + 160,
          cx - 40,
          LANDING_Y + 80,
          cx - 10,
          cy + 200,
          cx - 60,
          cy + 200,
        ])
        .fill(0xffe14d);
    }
  }
}
