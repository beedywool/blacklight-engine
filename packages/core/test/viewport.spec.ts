import { describe, expect, it } from 'vitest';
import { computeViewport } from '../src/viewport';

const hd = { width: 1920, height: 1080, mode: 'extend' as const, pixelArt: false };

describe('computeViewport', () => {
  it('extend shows more of the scene on wide screens', () => {
    const v = computeViewport(2560, 1080, hd);
    expect(v).toMatchObject({
      canvasWidth: 2560,
      canvasHeight: 1080,
      scale: 1,
      visibleWidth: 2560,
      visibleHeight: 1080,
    });
    expect(v.originX).toBe(320);
    expect(v.originY).toBe(0);
  });

  it('extend shows more of the scene on tall screens', () => {
    const v = computeViewport(960, 1080, hd);
    expect(v.scale).toBe(0.5);
    expect(v.visibleHeight).toBe(2160);
    expect(v.originY).toBe(270);
  });

  it('letterbox shrinks the canvas to the design ratio', () => {
    const v = computeViewport(2560, 1080, { ...hd, mode: 'letterbox' });
    expect(v).toMatchObject({
      canvasWidth: 1920,
      canvasHeight: 1080,
      originX: 0,
      visibleWidth: 1920,
    });
  });

  it('pixel art uses integer scales above 1', () => {
    const v = computeViewport(1000, 600, {
      width: 320,
      height: 180,
      mode: 'letterbox',
      pixelArt: true,
    });
    expect(v.scale).toBe(3);
    expect(v.canvasWidth).toBe(960);
  });
});
