import { afterEach, describe, expect, expectTypeOf, it, vi } from 'vitest';
import type { Game } from '../src/game';
import {
  DropItem,
  ModuleHost,
  Network,
  defineModule,
  nativeModule,
  pickModule,
  t,
  type Infer,
  type InferInput,
  type ModuleApi,
  type ModuleApiOf,
  type ModuleContext,
} from '../src/modules/index';
import { WebPlatform } from '../src/platform';
import { resolveConfig } from '../src/config';

afterEach(() => vi.useRealTimers());

function fakeGame(modules: Record<string, object> = {}, platform = new WebPlatform('test')): Game {
  return { config: { modules }, platform } as unknown as Game;
}

describe('schemas', () => {
  const config = t.object({
    file: t.string().default('game.db'),
    size: t.number({ integer: true, min: 1 }).optional(),
    mode: t.enum(['fast', 'safe']).default('safe'),
    tags: t.array(t.string()).default([]),
  });

  it('fills defaults and infers input and output types', () => {
    expect(config.parse({})).toEqual({ file: 'game.db', size: undefined, mode: 'safe', tags: [] });
    expectTypeOf<Infer<typeof config>>().toEqualTypeOf<{
      file: string;
      size: number | undefined;
      mode: 'fast' | 'safe';
      tags: string[];
    }>();
    expectTypeOf<InferInput<typeof config>>().toEqualTypeOf<{
      file?: string | undefined;
      size?: number | undefined;
      mode?: 'fast' | 'safe' | undefined;
      tags?: string[] | undefined;
    }>();
  });

  it('lists every problem with its path and a suggestion', () => {
    expect(() =>
      config.parse({ file: 3, size: 1.5, mode: 'fsat', tag: [] }, 'modules.db'),
    ).toThrowError(
      [
        '`modules.db.file` must be a string, got 3',
        '`modules.db.size` must be an integer >= 1, got 1.5',
        '`modules.db.mode` must be one of "fast" | "safe", got "fsat". Did you mean "fast"?',
        '`modules.db` has an unknown option `tag`. Did you mean "tags"? Known options: file, size, mode, tags.',
      ].join('\n'),
    );
  });

  it('checks URLs, records and bytes', () => {
    expect(() => t.string({ url: true }).parse('ftp://x')).toThrow(/http\(s\) URL/);
    expect(t.record(t.number()).parse({ a: 1 })).toEqual({ a: 1 });
    expect(() => t.bytes().parse([1])).toThrow(/Uint8Array/);
  });
});

describe('defineModule', () => {
  const counter = defineModule({
    name: 'counter',
    version: '1.0.0',
    config: t.object({ start: t.number().default(0) }),
    setup({ config }) {
      let value = config.start;
      return {
        add: (n: number) => (value += n),
        get value() {
          return value;
        },
      };
    },
  });
  const desktopOnly = defineModule({
    name: 'tray',
    version: '1.0.0',
    platforms: ['desktop'],
    async setup() {
      return { show: (): boolean => true };
    },
  });

  it('types the API, the config and platform availability', () => {
    expectTypeOf<ModuleApi<typeof counter>>().toEqualTypeOf<{
      add: (n: number) => number;
      readonly value: number;
    }>();
    expectTypeOf<ModuleApi<typeof desktopOnly>>().toEqualTypeOf<
      { show: () => boolean } | undefined
    >();
    const exports = { counter, other: 1 };
    expect(pickModule(exports, 'counter', 'x')).toBe(counter);
    expect(desktopOnly.platforms).toEqual(['desktop']);
    expectTypeOf<ModuleApiOf<typeof exports, 'counter'>>().toEqualTypeOf<
      ModuleApi<typeof counter>
    >();
  });

  it('refuses invalid names and finds definitions among exports', () => {
    expect(() => defineModule({ name: 'My Module', version: '1.0.0', setup: () => ({}) })).toThrow(
      /lowercase letters/,
    );
    expect(pickModule({ default: counter }, 'counter', 'x')).toBe(counter);
    expect(() => pickModule({ counter }, 'count', 'modules/count/count.module.ts')).toThrow(
      /exports the module "counter", not "count"/,
    );
    expect(() => pickModule({}, 'count', 'pkg')).toThrow(/does not export a module/);
  });
});

describe('ModuleHost', () => {
  it('sets modules up in dependency order with their context and disposes in reverse', async () => {
    const log: string[] = [];
    const base = defineModule({
      name: 'base',
      version: '1.0.0',
      config: t.object({ greeting: t.string().default('hi') }),
      setup(context) {
        log.push(`setup base ${context.config.greeting}`);
        context.onDispose(() => void log.push('dispose base'));
        return { greet: () => context.config.greeting };
      },
    });
    const top = defineModule({
      name: 'top',
      version: '1.0.0',
      dependencies: ['base'],
      setup(context: ModuleContext) {
        const dep = (context.modules as Record<string, { greet(): string }>).base!;
        log.push(`setup top sees ${dep.greet()} on ${context.platform.name}`);
        return { ok: true };
      },
      dispose() {
        log.push('dispose top');
      },
    });
    const host = new ModuleHost(fakeGame({ base: { greeting: 'hello' }, top: {} }));
    await host.install({ definitions: [top, base] });
    expect(host.apis.top).toEqual({ ok: true });
    await host.dispose();
    expect(log).toEqual([
      'setup base hello',
      'setup top sees hello on web',
      'dispose top',
      'dispose base',
    ]);
  });

  it('reports invalid options, unknown and missing modules before any setup', async () => {
    const setup = vi.fn(() => ({}));
    const a = defineModule({
      name: 'a',
      version: '1.0.0',
      config: t.object({ n: t.number() }),
      setup,
    });
    await expect(
      new ModuleHost(fakeGame({ a: { n: 'x' } })).install({ definitions: [a] }),
    ).rejects.toThrow('`modules.a.n` must be a number, got "x"');
    await expect(new ModuleHost(fakeGame({ b: {} })).install({ definitions: [a] })).rejects.toThrow(
      /lists the module "b".*blacklight add b/,
    );
    const needs = defineModule({ name: 'c', version: '1.0.0', dependencies: ['http'], setup });
    await expect(new ModuleHost(fakeGame()).install({ definitions: [needs] })).rejects.toThrow(
      'Module "c" needs the "http" module',
    );
    expect(setup).not.toHaveBeenCalled();
  });

  it('skips modules (and their dependents) on other platforms', async () => {
    const tray = defineModule({
      name: 'tray',
      version: '1.0.0',
      platforms: ['desktop'],
      setup: () => ({}),
    });
    const menu = defineModule({
      name: 'menu',
      version: '1.0.0',
      dependencies: ['tray'],
      setup: () => ({}),
    });
    const host = new ModuleHost(fakeGame());
    await host.install({ definitions: [tray, menu] });
    expect(host.apis).toEqual({});
  });

  it('names the module whose setup failed', async () => {
    const broken = defineModule({
      name: 'broken',
      version: '1.0.0',
      setup() {
        throw new Error('no database');
      },
    });
    await expect(new ModuleHost(fakeGame()).install({ definitions: [broken] })).rejects.toThrow(
      'Module "broken" failed to start: no database',
    );
  });

  it('gives each module its own storage and finds a compatible save system', async () => {
    const platform = new WebPlatform('test');
    const game = fakeGame({}, platform);
    const saves = {
      slots: async () => [],
      exportSlot: async () => undefined,
      importSlot: async () => {},
      onSaved: () => () => {},
    };
    (game as unknown as { save: unknown }).save = saves;
    let context!: ModuleContext;
    const m = defineModule({
      name: 'keeper',
      version: '1.0.0',
      setup(c) {
        context = c;
        return {};
      },
    });
    await new ModuleHost(game).install({ definitions: [m] });
    await context.storage.set('best', { score: 3 });
    expect(await context.storage.get('best')).toEqual({ score: 3 });
    expect(await platform.files.list('modules/')).toEqual(['modules/keeper/best.json']);
    expect(context.saves).toBe(saves);
  });
});

describe('config', () => {
  it('accepts module options and refuses other shapes', () => {
    const base = {
      name: 'G',
      id: 'com.example.g',
      version: '1.0.0',
      entry: 'title',
      resolution: { width: 10, height: 10 },
    };
    expect(resolveConfig({ ...base, modules: { sqlite: {} } }).modules).toEqual({ sqlite: {} });
    expect(() => resolveConfig({ ...base, modules: { sqlite: true } })).toThrow(
      /`modules` must map module names/,
    );
  });
});

describe('offline queue', () => {
  it('keeps items while offline and replays them in order when back online', async () => {
    const platform = new WebPlatform('test');
    const network = new Network(platform.files);
    network.setBrowserOnline(false);
    const sent: number[] = [];
    const queue = network.queue<number>('q.json', async (n) => {
      sent.push(n);
    });
    await queue.push(1);
    await queue.push(2);
    expect(sent).toEqual([]);
    expect(queue.size).toBe(2);
    const drained = new Promise<void>((resolve) => queue.events.on('drained', resolve));
    network.setBrowserOnline(true);
    await drained;
    expect(sent).toEqual([1, 2]);
    expect(queue.size).toBe(0);
    network.dispose();
  });

  it('retries with backoff after failures, survives a restart and drops refused items', async () => {
    vi.useFakeTimers();
    const platform = new WebPlatform('test');
    let up = false;
    const sent: string[] = [];
    const handler = async (item: string) => {
      if (item === 'bad') throw new DropItem('refused');
      if (!up) throw new TypeError('Failed to fetch');
      sent.push(item);
    };
    const first = new Network(platform.files);
    const q1 = first.queue<string>('q.json', handler, { retryDelay: 100 });
    await q1.push('a');
    await q1.flush();
    expect(first.online).toBe(false);
    await vi.advanceTimersByTimeAsync(100); // second failure, next try in 200 ms
    first.dispose();

    // Next run: the item is still there.
    const second = new Network(platform.files);
    const q2 = second.queue<string>('q.json', handler, { retryDelay: 100 });
    await q2.flush();
    expect(q2.pending()).toEqual(['a']);
    await q2.push('bad');
    up = true;
    await vi.advanceTimersByTimeAsync(100);
    await q2.flush();
    expect(sent).toEqual(['a']);
    expect(q2.size).toBe(0);
    expect(second.online).toBe(true);
    second.dispose();
  });
});

describe('nativeModule', () => {
  it('calls platform.invoke with the module name', async () => {
    const platform = new WebPlatform('test');
    platform.registerFallback('math', { add: (a, b) => (a as number) + (b as number) });
    interface MathNative {
      functions: { add: { run(context: unknown, a: number, b: number): number } };
    }
    const math = nativeModule<MathNative>(platform, 'math');
    expectTypeOf(math.add).toEqualTypeOf<(a: number, b: number) => Promise<number>>();
    expect(await math.add(2, 3)).toBe(5);
  });
});
