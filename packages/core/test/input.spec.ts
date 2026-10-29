import { describe, expect, it } from 'vitest';
import { bindingLabel, parseBinding } from '../src/input/bindings';
import { parseGamepadId, parseSdlMapping, readWithSdl, sdlPlatform } from '../src/input/gamepad';
import { InputManager } from '../src/input/input';
import { findPath } from '../src/behaviors/grid';

function pad(index: number, buttons: number[] = [], axes: number[] = [0, 0, 0, 0]): Gamepad {
  return {
    index,
    id: `pad ${index}`,
    connected: true,
    mapping: 'standard',
    axes,
    buttons: Array.from({ length: 17 }, (_, i) => ({
      value: buttons[i] ?? 0,
      pressed: (buttons[i] ?? 0) > 0.5,
      touched: false,
    })),
    timestamp: 0,
    hapticActuators: [],
    vibrationActuator: null,
  } as unknown as Gamepad;
}

describe('bindings', () => {
  it('parses and labels', () => {
    expect(parseBinding('KeyA')).toEqual({ device: 'keyboard', code: 'KeyA' });
    expect(parseBinding('Pad:RT')).toEqual({ device: 'gamepad', button: 7 });
    expect(parseBinding('Pad:LeftStickUp')).toEqual({ device: 'gamepad', axis: 1, sign: -1 });
    expect(parseBinding('Mouse:Right')).toEqual({ device: 'mouse', button: 2 });
    expect(() => parseBinding('Pad:Z')).toThrow(/Unknown input binding/);
    expect(bindingLabel('KeyA')).toBe('A');
    expect(bindingLabel('ArrowLeft')).toBe('Left');
  });
});

describe('InputManager', () => {
  it('reports pressed, held and released per step', () => {
    const input = new InputManager({}, undefined, () => []);
    input.keyDown('Space');
    input.update();
    expect(input.pressed('jump')).toBe(true);
    expect(input.held('jump')).toBe(true);
    input.update();
    expect(input.pressed('jump')).toBe(false);
    expect(input.held('jump')).toBe(true);
    input.keyUp('Space');
    input.update();
    expect(input.released('jump')).toBe(true);
  });

  it('catches a tap between two steps', () => {
    const input = new InputManager({}, undefined, () => []);
    input.keyDown('Enter');
    input.keyUp('Enter');
    input.update();
    expect(input.pressed('confirm')).toBe(true);
    expect(input.value('confirm')).toBe(1);
  });

  it('reads sticks with a dead zone and vectors', () => {
    const pads = [pad(0, [], [0.1, 0, 0, 0])];
    const input = new InputManager({}, undefined, () => pads);
    input.update();
    expect(input.axis('left', 'right')).toBe(0);
    pads[0] = pad(0, [], [1, -1, 0, 0]);
    input.update();
    const v = input.vector('left', 'right', 'up', 'down');
    expect(v.length).toBeCloseTo(1);
    expect(v.x).toBeGreaterThan(0);
    expect(v.y).toBeLessThan(0);
  });

  it('joins players on unowned pads and separates their input', () => {
    const pads = [pad(0), pad(1)];
    const input = new InputManager({}, undefined, () => pads);
    pads[0] = pad(0, [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1]);
    input.update(); // player 1 uses pad 0
    pads[0] = pad(0);
    input.update();
    pads[1] = pad(1, [1]);
    input.update();
    const joined = input.join();
    expect(joined?.number).toBe(2);
    expect(input.joinedPlayers).toHaveLength(2);
    input.update();
    expect(input.player(2).held('confirm')).toBe(true);
    expect(input.player(1).held('confirm')).toBe(false);
    expect(() => input.player(9)).toThrow(/1 to 8/);
  });

  it('rebinds, persists and resets', () => {
    const saved = new Map<string, unknown>();
    const settings = {
      get: <T>(k: string) => saved.get(k) as T,
      set: (k: string, v: unknown) => void saved.set(k, v),
    };
    const input = new InputManager({ actions: { fire: ['KeyJ'] } }, settings, () => []);
    input.rebind('fire', ['KeyK']);
    expect(saved.get('input.bindings')).toEqual({ fire: ['KeyK'] });
    const again = new InputManager({ actions: { fire: ['KeyJ'] } }, settings, () => []);
    expect(again.bindingsOf('fire')).toEqual(['KeyK']);
    again.resetBindings('fire');
    expect(again.bindingsOf('fire')).toEqual(['KeyJ']);
  });

  it('captures the next binding', async () => {
    const input = new InputManager({}, undefined, () => []);
    const next = input.captureBinding();
    input.keyDown('KeyQ');
    await expect(next).resolves.toBe('KeyQ');
  });

  it('feeds virtual controls into actions', () => {
    const input = new InputManager({}, undefined, () => []);
    input.player(1).virtual.set('right', 0.8);
    input.update();
    expect(input.held('right')).toBe(true);
    expect(input.value('right')).toBeCloseTo(0.8);
  });
});

describe('SDL mappings', () => {
  const line =
    '030000004c050000cc09000000000000,PS4 Controller,a:b1,b:b2,x:b0,y:b3,leftx:a0,lefty:a1,dpup:h0.1,lefttrigger:a3,platform:Windows,';
  it('parses GUIDs and browser ids', () => {
    const mapping = parseSdlMapping(line)!;
    expect(mapping.vendor).toBe(0x054c);
    expect(mapping.product).toBe(0x09cc);
    expect(mapping.platform).toBe('Windows');
    expect(
      parseGamepadId('Wireless Controller (STANDARD GAMEPAD Vendor: 054c Product: 09cc)'),
    ).toEqual({ vendor: 0x054c, product: 0x09cc });
    expect(parseGamepadId('54c-9cc-Wireless Controller')).toEqual({
      vendor: 0x054c,
      product: 0x09cc,
    });
    expect(sdlPlatform('Mozilla/5.0 (X11; Linux x86_64)')).toBe('Linux');
  });

  it('reads a raw pad through a mapping', () => {
    const raw = {
      ...pad(0, [0, 1, 0, 0]),
      mapping: '',
      axes: [0.5, 0, 0, -1],
    } as unknown as Gamepad;
    const state = readWithSdl(raw, parseSdlMapping(line)!);
    expect(state.buttons[0]).toBe(1); // A is b1
    expect(state.axes[0]).toBe(0.5);
    expect(state.buttons[6]).toBe(0); // LT on a full axis at −1 is released
  });
});

describe('findPath', () => {
  it('goes around walls', () => {
    const walls = new Set(['1,0', '1,1']);
    const path = findPath(
      { column: 0, row: 0 },
      { column: 2, row: 0 },
      (c, r) => c < 0 || r < 0 || c > 3 || r > 3 || walls.has(`${c},${r}`),
    );
    expect(path?.at(-1)).toEqual({ column: 2, row: 0 });
    expect(path).toHaveLength(6);
    expect(findPath({ column: 0, row: 0 }, { column: 5, row: 5 }, () => true)).toBeUndefined();
  });
});
