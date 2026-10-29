import type { ResolutionConfig } from './config';

/** Where the design area lands on screen. All lengths in CSS pixels unless noted. */
export interface Viewport {
  /** Size of the canvas element. */
  canvasWidth: number;
  canvasHeight: number;
  /** CSS pixels per virtual pixel. */
  scale: number;
  /** Position of the design area's top-left corner inside the canvas. */
  originX: number;
  originY: number;
  /** Visible area in virtual pixels (larger than the design area in `extend` mode). */
  visibleWidth: number;
  visibleHeight: number;
}

/**
 * Fits the virtual resolution into a screen of `screenWidth` × `screenHeight` CSS pixels.
 *
 * @example
 * ```ts
 * computeViewport(2560, 1080, { width: 1920, height: 1080, mode: 'extend' });
 * // scale 1, visibleWidth 2560, originX 320
 * ```
 */
export function computeViewport(
  screenWidth: number,
  screenHeight: number,
  resolution: Required<ResolutionConfig>,
): Viewport {
  const { width, height, mode, pixelArt } = resolution;
  let scale = Math.min(screenWidth / width, screenHeight / height);
  // Integer scales keep pixel art crisp; below 1 there is no crisp option, so keep the exact fit.
  if (pixelArt && scale >= 1) scale = Math.floor(scale);
  if (!(scale > 0)) scale = 1;

  if (mode === 'letterbox') {
    const canvasWidth = Math.round(width * scale);
    const canvasHeight = Math.round(height * scale);
    return {
      canvasWidth,
      canvasHeight,
      scale,
      originX: 0,
      originY: 0,
      visibleWidth: width,
      visibleHeight: height,
    };
  }

  const visibleWidth = screenWidth / scale;
  const visibleHeight = screenHeight / scale;
  return {
    canvasWidth: screenWidth,
    canvasHeight: screenHeight,
    scale,
    originX: ((visibleWidth - width) / 2) * scale,
    originY: ((visibleHeight - height) / 2) * scale,
    visibleWidth,
    visibleHeight,
  };
}
