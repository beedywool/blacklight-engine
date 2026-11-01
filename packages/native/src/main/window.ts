import type { WindowConfig } from '@blacklight/core/config';

interface Size {
  width: number;
  height: number;
}

/**
 * First content size and minimum size of the window: the design resolution scaled to fit 80 % of
 * the screen's work area, keeping its aspect ratio.
 */
export function windowSizes(
  design: Size,
  workArea: Size,
  config: WindowConfig = {},
): { size: Size; minSize: Size } {
  const ratio = design.width / design.height;
  let size = config.size;
  if (!size) {
    const scale = Math.min(
      1,
      (workArea.width * 0.8) / design.width,
      (workArea.height * 0.8) / design.height,
    );
    size = { width: Math.round(design.width * scale), height: Math.round(design.height * scale) };
  }
  const minSize = config.minSize ?? {
    width: Math.max(320, Math.round(design.width / 2)),
    height: Math.max(Math.round(320 / ratio), Math.round(design.height / 2)),
  };
  return { size, minSize };
}

/**
 * Content height that restores the aspect ratio after a resize, for window managers that ignore
 * `setAspectRatio` (most Linux ones). `undefined` when the size already matches.
 */
export function heightForRatio(content: Size, ratio: number): number | undefined {
  const height = Math.round(content.width / ratio);
  return Math.abs(height - content.height) > 1 ? height : undefined;
}

/**
 * Display-mode options of the game window. `fullscreenable` is always set: on macOS Electron
 * disables fullscreen (button, `setFullScreen`) when `fullscreen: false` is passed explicitly, and a
 * game must be able to switch to fullscreen whatever it starts in.
 */
export function windowMode(
  config: WindowConfig = {},
  savedFullscreen?: boolean,
): { fullscreen: boolean; fullscreenable: true; resizable: boolean } {
  return {
    fullscreen: savedFullscreen ?? config.fullscreen ?? false,
    fullscreenable: true,
    resizable: config.resizable ?? true,
  };
}
