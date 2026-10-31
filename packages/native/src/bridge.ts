// The contract between the preload script and the page. The preload exposes exactly this object as
// `window.blacklightNative`; everything else stays in the main process.

/** IPC channels. */
export const CHANNELS = {
  /** renderer → main: `invoke(module, method, args)`. */
  invoke: 'blacklight:invoke',
  /** main → renderer: `(event, payload)`. */
  event: 'blacklight:event',
} as const;

/** What the page learns about the app at startup. */
export interface NativeInfo {
  /** OS the app runs on, as Node names it. */
  platform: 'win32' | 'darwin' | 'linux';
  /** Started from Steam with a working Steamworks connection. */
  steam: boolean;
  /** Release build (security measures on). */
  release: boolean;
  /** Folder of `platform.files`. */
  dataDir: string;
  /** Game version (`version` in game.config.ts). */
  version: string;
}

/** `window.blacklightNative`, set by the preload script of the desktop app. */
export interface NativeBridge {
  /** Facts about the app, known before the game starts. */
  readonly info: NativeInfo;
  /** Calls `module.method(...args)` in the main process. Rejects with the handler's error message. */
  invoke(module: string, method: string, args: unknown[]): Promise<unknown>;
  /** Receives every event the main process sends. Returns a function that stops listening. */
  subscribe(listener: (event: string, payload: unknown) => void): () => void;
}

/** Answer of the `invoke` channel: errors cross as data so their message survives. */
export type InvokeResult = { ok: true; value: unknown } | { ok: false; error: string };

/** One pad as the main process reports it (SDL game controller layout). */
export interface SdlPadState {
  /** SDL instance id, stable while the pad stays connected. */
  id: number;
  /** Controller name reported by SDL (`Xbox Series X Controller`). */
  name: string;
  /** USB vendor id. */
  vendor: number;
  /** USB product id. */
  product: number;
  /** `xboxOne`, `ps5`, `nintendoSwitchPro`… (`null` when SDL does not know). */
  type: string | null;
  /** Values 0–1 in the engine's button order (A, B, X, Y, LB, RB, LT, RT, Back, Start, LS, RS, Up, Down, Left, Right, Home). */
  buttons: number[];
  /** Left x, y, right x, y, −1 to 1. */
  axes: [number, number, number, number];
  /** The pad has rumble motors. */
  hasRumble: boolean;
  /** The pad has trigger motors (Xbox One and later). */
  hasRumbleTriggers: boolean;
  /** The pad has a light bar or LED. */
  hasLed: boolean;
  /** Gyro and accelerometer: not exposed by the SDL binding yet (see the desktop guide). */
  hasGyro: boolean;
}

declare global {
  interface Window {
    blacklightNative?: NativeBridge;
  }
}
