// Gamepads through SDL in the main process (RT-12): hot-plug, rumble, trigger rumble, LEDs, and
// SDL_GameControllerDB mappings, sent to the page as standard-layout pads.

import type { SdlPadState } from '../bridge';
import { method, registerNative } from './registry';
import { v } from './validate';

/** The part of `@kmamal/sdl` used here (kept small so tests can stand in for it). */
export interface SdlBinding {
  controller: {
    readonly devices: SdlDevice[];
    addMappings(mappings: string[]): void;
    openDevice(device: SdlDevice): SdlController;
    on(event: 'deviceAdd' | 'deviceRemove', listener: (event: { device: SdlDevice }) => void): void;
  };
}

export interface SdlDevice {
  id: number;
  name: string | null;
  vendor: number | null;
  product: number | null;
  type: string | null;
}

export interface SdlController {
  readonly device: SdlDevice;
  readonly axes: Record<string, number>;
  readonly buttons: Record<string, boolean>;
  readonly hasLed: boolean;
  readonly hasRumble: boolean;
  readonly hasRumbleTriggers: boolean;
  readonly closed: boolean;
  setLed(red: number, green: number, blue: number): void;
  rumble(low?: number, high?: number, duration?: number): void;
  rumbleTriggers(left?: number, right?: number, duration?: number): void;
  on(event: 'axisMotion' | 'buttonDown' | 'buttonUp' | 'close', listener: () => void): void;
  close(): void;
}

/** SDL button names in the engine's order (`PAD_BUTTONS` of core). */
const BUTTONS = [
  'a',
  'b',
  'x',
  'y',
  'leftShoulder',
  'rightShoulder',
  '', // LT: an axis in SDL
  '', // RT
  'back',
  'start',
  'leftStick',
  'rightStick',
  'dpadUp',
  'dpadDown',
  'dpadLeft',
  'dpadRight',
  'guide',
] as const;

/** SDL platform name used in gamecontrollerdb.txt. */
export function sdlPlatformName(platform: NodeJS.Platform = process.platform): string {
  return platform === 'win32' ? 'Windows' : platform === 'darwin' ? 'Mac OS X' : 'Linux';
}

/** Lines of gamecontrollerdb.txt for this OS. */
export function mappingsFor(db: string, platform: string = sdlPlatformName()): string[] {
  return db
    .split('\n')
    .filter((line) => !line.startsWith('#') && line.includes(`platform:${platform},`));
}

/** Reads one controller in the engine's layout. */
export function padState(controller: SdlController): SdlPadState {
  const { axes, buttons, device } = controller;
  const values: number[] = BUTTONS.map((name) => (name && buttons[name] ? 1 : 0));
  values[6] = Math.max(0, axes.leftTrigger ?? 0);
  values[7] = Math.max(0, axes.rightTrigger ?? 0);
  return {
    id: device.id,
    name: device.name ?? 'Gamepad',
    vendor: device.vendor ?? 0,
    product: device.product ?? 0,
    type: device.type,
    buttons: values,
    axes: [
      axes.leftStickX ?? 0,
      axes.leftStickY ?? 0,
      axes.rightStickX ?? 0,
      axes.rightStickY ?? 0,
    ],
    hasRumble: controller.hasRumble,
    hasRumbleTriggers: controller.hasRumbleTriggers,
    hasLed: controller.hasLed,
    hasGyro: false,
  };
}

/**
 * Opens every controller SDL sees (and those plugged later), registers the `sdl` native module
 * and sends `sdl:pads` (every pad's state) whenever something changes, at most once per event-loop
 * turn.
 */
export function startGamepads(
  sdl: SdlBinding,
  emit: (event: string, payload: unknown) => void,
  db = '',
): () => void {
  if (db) sdl.controller.addMappings(mappingsFor(db));
  const open = new Map<number, SdlController>();
  let scheduled = false;
  const flush = () => {
    scheduled = false;
    emit('sdl:pads', [...open.values()].filter((c) => !c.closed).map(padState));
  };
  const changed = () => {
    if (scheduled) return;
    scheduled = true;
    setImmediate(flush);
  };
  const add = (device: SdlDevice) => {
    if (open.has(device.id)) return;
    try {
      const controller = sdl.controller.openDevice(device);
      open.set(device.id, controller);
      for (const event of ['axisMotion', 'buttonDown', 'buttonUp'] as const) {
        controller.on(event, changed);
      }
      controller.on('close', () => {
        open.delete(device.id);
        changed();
      });
      changed();
    } catch (error) {
      console.warn(`[blacklight] gamepad "${device.name}" could not be opened:`, error);
    }
  };
  sdl.controller.on('deviceAdd', ({ device }) => add(device));
  sdl.controller.on('deviceRemove', ({ device }) => {
    const controller = open.get(device.id);
    open.delete(device.id);
    if (controller && !controller.closed) controller.close();
    changed();
  });
  for (const device of sdl.controller.devices) add(device);

  const pad = (id: number) => {
    const controller = open.get(id);
    if (!controller || controller.closed) throw new Error(`No gamepad with id ${id} is connected.`);
    return controller;
  };
  const unit = v.number({ min: 0, max: 1 });
  const id = v.integer({ min: 0 });
  const duration = v.optional(v.integer({ min: 0, max: 60_000 }));
  const byte = v.integer({ min: 0, max: 255 });
  const unregister = registerNative('sdl', {
    pads: method([], () => [...open.values()].filter((c) => !c.closed).map(padState)),
    rumble: method([id, unit, unit, duration], (pad_, low, high, ms) =>
      pad(pad_).rumble(low, high, ms ?? 200),
    ),
    rumbleTriggers: method([id, unit, unit, duration], (pad_, left, right, ms) =>
      pad(pad_).rumbleTriggers(left, right, ms ?? 200),
    ),
    led: method([id, byte, byte, byte], (pad_, r, g, b) => pad(pad_).setLed(r, g, b)),
  });
  return () => {
    unregister();
    for (const controller of open.values()) if (!controller.closed) controller.close();
    open.clear();
  };
}
