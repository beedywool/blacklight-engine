// @blacklight-deterministic (drawn from simulation objects; nothing here reads the clock)
// Player skins: original placeholder art drawn with Pixi graphics (CC0), one per player slot by
// default. The player-select screen cycles through them.
import { DMath, type Graphics } from '@blacklight/core';

export interface Skin {
  name: string;
  /** Body color. */
  body: number;
  /** Second color of the pattern. */
  accent: number;
  pattern: 'band' | 'visor' | 'dots' | 'horns' | 'crown' | 'stripes' | 'ears' | 'spikes';
}

export const SKINS: readonly Skin[] = [
  { name: 'RED', body: 0xe60012, accent: 0xffffff, pattern: 'band' },
  { name: 'BLUE', body: 0x2f7cf6, accent: 0x0b1d3a, pattern: 'visor' },
  { name: 'GOLD', body: 0xf6c445, accent: 0x7a4b00, pattern: 'dots' },
  { name: 'MINT', body: 0x3ddc97, accent: 0x0c3b2a, pattern: 'horns' },
  { name: 'VIOLET', body: 0x9b5de5, accent: 0xffd60a, pattern: 'crown' },
  { name: 'ORANGE', body: 0xff7a1a, accent: 0x2b1400, pattern: 'stripes' },
  { name: 'PINK', body: 0xff5fa2, accent: 0xffffff, pattern: 'ears' },
  { name: 'SILVER', body: 0xc9d1d9, accent: 0x2b2b2b, pattern: 'spikes' },
];

/** CSS color of a skin, for the UI. */
export function skinColor(skin: number): string {
  return `#${SKINS[skin % SKINS.length]!.body.toString(16).padStart(6, '0')}`;
}

type Pen = Graphics['draw'];

/**
 * Draws a skin centered on (0, 0), facing `facing` radians (the eyes look that way).
 *
 * @example
 * ```ts
 * drawSkin(this.draw, this.skin, 26, this.facing);
 * ```
 */
export function drawSkin(pen: Pen, skin: number, radius: number, facing = 0): void {
  const { body, accent, pattern } = SKINS[skin % SKINS.length]!;
  const r = radius;
  switch (pattern) {
    case 'horns':
      pen.poly([-r * 0.8, -r * 0.4, -r * 0.55, -r * 1.35, -r * 0.2, -r * 0.8]).fill(accent);
      pen.poly([r * 0.8, -r * 0.4, r * 0.55, -r * 1.35, r * 0.2, -r * 0.8]).fill(accent);
      break;
    case 'ears':
      pen.circle(-r * 0.65, -r * 0.75, r * 0.38).fill(body);
      pen.circle(r * 0.65, -r * 0.75, r * 0.38).fill(body);
      pen.circle(-r * 0.65, -r * 0.75, r * 0.2).fill(accent);
      pen.circle(r * 0.65, -r * 0.75, r * 0.2).fill(accent);
      break;
    case 'spikes':
      for (let i = 0; i < 5; i++) {
        const a = -DMath.PI * 0.85 + (i * DMath.PI * 0.7) / 4;
        const x = DMath.cos(a);
        const y = DMath.sin(a);
        pen
          .poly([
            x * r * 0.7 - y * 6,
            y * r * 0.7 + x * 6,
            x * r * 1.35,
            y * r * 1.35,
            x * r * 0.7 + y * 6,
            y * r * 0.7 - x * 6,
          ])
          .fill(accent);
      }
      break;
    case 'crown':
      pen
        .poly([
          -r * 0.6,
          -r * 0.7,
          -r * 0.6,
          -r * 1.3,
          -r * 0.3,
          -r * 1.0,
          0,
          -r * 1.4,
          r * 0.3,
          -r * 1.0,
          r * 0.6,
          -r * 1.3,
          r * 0.6,
          -r * 0.7,
        ])
        .fill(accent);
      break;
    default:
      break;
  }
  pen.circle(0, 0, r).fill(body).stroke({ width: 4, color: 0x111111 });
  switch (pattern) {
    case 'band':
      pen.rect(-r * 0.92, -r * 0.62, r * 1.84, r * 0.3).fill(accent);
      break;
    case 'visor':
      pen.roundRect(-r * 0.75, -r * 0.42, r * 1.5, r * 0.6, r * 0.3).fill(accent);
      break;
    case 'dots':
      pen.circle(-r * 0.45, r * 0.45, r * 0.16).fill(accent);
      pen.circle(r * 0.5, r * 0.4, r * 0.12).fill(accent);
      pen.circle(0, r * 0.68, r * 0.1).fill(accent);
      break;
    case 'stripes':
      pen.rect(-r * 0.7, r * 0.2, r * 1.4, r * 0.16).fill(accent);
      pen.rect(-r * 0.55, r * 0.5, r * 1.1, r * 0.16).fill(accent);
      break;
    default:
      break;
  }
  // Eyes look where the player goes.
  const lx = DMath.cos(facing) * r * 0.18;
  const ly = DMath.sin(facing) * r * 0.18;
  for (const side of [-1, 1]) {
    pen.circle(side * r * 0.32, -r * 0.08, r * 0.24).fill(0xffffff);
    pen.circle(side * r * 0.32 + lx, -r * 0.08 + ly, r * 0.11).fill(0x111111);
  }
}
