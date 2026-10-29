import { describe, expect, expectTypeOf, it } from 'vitest';
import { nativeModule } from '../../core/src/modules/native';
import { t } from '../../core/src/modules/schema';
import { WebPlatform } from '../../core/src/platform';
import { defineNative, fn, isNativeModule, type NativeContext } from '../src/define-native';

const context: NativeContext = { gameId: 'com.example.test', dataDir: '/tmp/test', dev: true };

const notes = defineNative({
  name: 'notes',
  functions: {
    add: fn([t.number(), t.number()], (_context, a, b) => a + b),
    greet: fn([t.string(), t.string().optional()], (c, name, punctuation) => {
      return `${name}${punctuation ?? '!'} from ${c.gameId}`;
    }),
    folder: fn([], async (c) => c.dataDir),
  },
});

describe('defineNative', () => {
  it('runs exposed functions with checked arguments and the native context', async () => {
    expect(isNativeModule(notes)).toBe(true);
    expect(notes.methods).toEqual(['add', 'greet', 'folder']);
    expect(await notes.call('add', [2, 3], context)).toBe(5);
    expect(await notes.call('greet', ['Ann'], context)).toBe('Ann! from com.example.test');
    expect(await notes.call('folder', [], context)).toBe('/tmp/test');
  });

  it('refuses unknown methods, prototype names and invalid arguments', async () => {
    await expect(notes.call('remove', [], context)).rejects.toThrow(
      '"notes.remove" does not exist. Exposed functions: add, greet, folder.',
    );
    await expect(notes.call('constructor', [], context)).rejects.toThrow(/does not exist/);
    await expect(notes.call('__proto__', [], context)).rejects.toThrow(/does not exist/);
    await expect(notes.call('add', [2, '3'], context)).rejects.toThrow(
      '"notes.add" refused its arguments: `argument 2` must be a number, got "3".',
    );
    await expect(notes.call('add', [1, 2, 3], context)).rejects.toThrow(
      /expected 2 arguments, got 3/,
    );
    await expect(notes.call('add', 'nope' as never, context)).rejects.toThrow(/as an array/);
    expect(() => defineNative({ name: 'Bad Name', functions: {} })).toThrow(/invalid/);
  });

  it('gives the game typed calls through platform.invoke', async () => {
    const platform = new WebPlatform('test');
    // Stands in for the Electron main process: invoke → call.
    platform.registerFallback('notes', {
      add: (...args) => notes.call('add', args, context),
    });
    const api = nativeModule<typeof notes>(platform, 'notes');
    expectTypeOf(api.add).toEqualTypeOf<(a: number, b: number) => Promise<number>>();
    expectTypeOf(api.greet).toEqualTypeOf<
      (name: string, punctuation: string | undefined) => Promise<string>
    >();
    expect(await api.add(4, 5)).toBe(9);
  });
});
