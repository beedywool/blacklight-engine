import { EventBus } from '../events';
import type { Game } from '../game';
import { didYouMean } from '../suggest';
import type {
  AnyModuleDefinition,
  GameModules,
  ModuleContext,
  ModuleEvents,
  ModuleLogger,
  ModuleSaves,
  ModuleStorage,
} from './define';
import { Network, type ModuleNetwork } from './network';
import { SchemaError } from './schema';

/** What the generated entry passes to `createGame` as `modules`. */
export interface ModuleList {
  /** Definitions of the modules listed in `game.config.ts`, any order. */
  definitions: AnyModuleDefinition[];
  /** Dev build (`import.meta.env.DEV`): enables `debug` logs. */
  dev?: boolean;
}

/**
 * Thrown when a module cannot start; the message says which one and how to fix it. `createGame`
 * rejects with it before the first scene starts.
 *
 * @example
 * ```ts
 * import { ModuleError, createGame } from '@blacklight/core';
 *
 * try {
 *   await createGame(config, options);
 * } catch (error) {
 *   if (error instanceof ModuleError) showFatalError(error.message);
 *   else throw error;
 * }
 * ```
 */
export class ModuleError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ModuleError';
  }
}

function logger(name: string, dev: boolean): ModuleLogger {
  const prefix = `[${name}]`;
  return {
    debug: (...args) => {
      if (dev) console.debug(prefix, ...args);
    },
    info: (...args) => console.info(prefix, ...args),
    warn: (...args) => console.warn(prefix, ...args),
    error: (...args) => console.error(prefix, ...args),
  };
}

function storage(game: Game, name: string): ModuleStorage {
  const path = (key: string) => `modules/${name}/${key}.json`;
  return {
    async get<T>(key: string) {
      const data = await game.platform.files.read(path(key));
      if (!data) return undefined;
      try {
        return JSON.parse(new TextDecoder().decode(data)) as T;
      } catch {
        return undefined;
      }
    },
    async set(key, value) {
      await game.platform.files.write(path(key), new TextEncoder().encode(JSON.stringify(value)));
    },
    async remove(key) {
      await game.platform.files.remove(path(key));
    },
  };
}

function isModuleSaves(value: unknown): value is ModuleSaves {
  const saves = value as Partial<ModuleSaves> | undefined;
  return (
    typeof saves?.slots === 'function' &&
    typeof saves.exportSlot === 'function' &&
    typeof saves.importSlot === 'function' &&
    typeof saves.onSaved === 'function'
  );
}

/** Dependencies first; a cycle or a missing dependency is an error. */
function order(definitions: AnyModuleDefinition[]): AnyModuleDefinition[] {
  const byName = new Map(definitions.map((d) => [d.name, d]));
  const sorted: AnyModuleDefinition[] = [];
  const state = new Map<string, 'visiting' | 'done'>();
  const visit = (definition: AnyModuleDefinition, chain: string[]) => {
    const status = state.get(definition.name);
    if (status === 'done') return;
    if (status === 'visiting') {
      throw new ModuleError(
        `Modules depend on each other in a loop: ${[...chain, definition.name].join(' → ')}. Remove one of these dependencies.`,
      );
    }
    state.set(definition.name, 'visiting');
    for (const dependency of definition.dependencies ?? []) {
      const target = byName.get(dependency);
      if (!target) {
        throw new ModuleError(
          `Module "${definition.name}" needs the "${dependency}" module. Install it (\`blacklight add ${dependency}\`) and list it under \`modules\` in game.config.ts.`,
        );
      }
      visit(target, [...chain, definition.name]);
    }
    state.set(definition.name, 'done');
    sorted.push(definition);
  };
  for (const definition of definitions) visit(definition, []);
  return sorted;
}

/**
 * The modules of a running game: sets them up in dependency order with their checked
 * configuration and disposes them in reverse order on shutdown.
 *
 * @internal The game creates it from the generated module list; games use `game.modules` and
 * modules their `context`.
 */
export class ModuleHost {
  /** Module APIs by name (`game.modules`). */
  readonly apis: Record<string, unknown> = {};
  readonly events = new EventBus<ModuleEvents>();
  readonly network: Network;
  private readonly disposers: (() => void | Promise<void>)[] = [];
  private disposed: Promise<void> | undefined;

  constructor(private readonly game: Game) {
    this.network = new Network(game.platform.files);
  }

  /**
   * Checks every configuration first (all problems in one error), then runs each `setup`.
   *
   * @throws {@link ModuleError} for invalid configurations, missing dependencies or a failing setup.
   */
  async install(list: ModuleList): Promise<void> {
    const { game } = this;
    const dev = list.dev ?? false;
    const configs = (game.config.modules ?? {}) as Record<string, unknown>;
    const names = list.definitions.map((d) => d.name);
    for (const key of Object.keys(configs)) {
      if (!names.includes(key)) {
        throw new ModuleError(
          `game.config.ts lists the module "${key}", but no module with that name was loaded.${didYouMean(key, names)} Install it with \`blacklight add ${key}\` or create modules/${key}/${key}.module.ts.`,
        );
      }
    }

    const issues: string[] = [];
    const checked = new Map<string, unknown>();
    for (const definition of list.definitions) {
      const raw = configs[definition.name];
      if (!definition.config) {
        if (raw !== undefined && Object.keys(raw as object).length > 0) {
          issues.push(
            `\`modules.${definition.name}\`: this module takes no options; use \`${definition.name}: {}\``,
          );
        }
        continue;
      }
      const result = (() => {
        const found: string[] = [];
        const value = definition.config!.check(raw ?? {}, `modules.${definition.name}`, found);
        issues.push(...found);
        return value;
      })();
      checked.set(definition.name, result);
    }
    if (issues.length > 0) {
      throw new ModuleError(
        `game.config.ts has invalid module options:\n${issues.map((issue) => `  - ${issue}`).join('\n')}`,
      );
    }

    const platform = game.platform;
    const unsupported = new Set<string>();
    const resume = () => void this.network.flushAll();
    const offResume = platform.on('resume', resume);
    // Closing the tab or the window is the shutdown of a web game; a page kept in the
    // back-forward cache (`persisted`) may come back, so its modules stay.
    const onPageHide = (event: { persisted?: boolean }) => {
      if (!event.persisted) void this.dispose();
    };
    globalThis.addEventListener?.('pagehide', onPageHide);
    this.disposers.push(() => {
      offResume();
      globalThis.removeEventListener?.('pagehide', onPageHide);
      this.network.dispose();
    });

    for (const definition of order(list.definitions)) {
      const log = logger(definition.name, dev);
      const skippedDependency = (definition.dependencies ?? []).find((d) => unsupported.has(d));
      if (definition.platforms && !definition.platforms.includes(platform.name)) {
        unsupported.add(definition.name);
        log.debug(
          `not available on ${platform.name}; game.modules.${definition.name} is undefined`,
        );
        continue;
      }
      if (skippedDependency) {
        unsupported.add(definition.name);
        log.debug(
          `skipped: its dependency "${skippedDependency}" is not available on ${platform.name}`,
        );
        continue;
      }
      const own: (() => void | Promise<void>)[] = [];
      const context: ModuleContext<unknown> = {
        name: definition.name,
        config: checked.get(definition.name),
        game,
        platform,
        events: this.events,
        modules: this.apis as GameModules,
        get saves() {
          const save = (game as unknown as { save?: unknown }).save;
          return isModuleSaves(save) ? save : undefined;
        },
        network: this.moduleNetwork(definition.name),
        log,
        storage: storage(game, definition.name),
        dev,
        onDispose: (dispose) => void own.push(dispose),
      };
      let api: unknown;
      try {
        api = await definition.setup(context);
      } catch (error) {
        const reason = error instanceof SchemaError ? error.issues.join('; ') : String(error);
        throw new ModuleError(
          `Module "${definition.name}" failed to start: ${error instanceof Error ? error.message : reason}`,
        );
      }
      this.apis[definition.name] = api;
      this.disposers.push(async () => {
        for (const dispose of own.reverse()) await dispose();
        await definition.dispose?.(api, context);
      });
    }
  }

  /** The shared network, with queues stored in the module's folder. */
  private moduleNetwork(name: string): ModuleNetwork {
    const network = this.network;
    return {
      get online() {
        return network.online;
      },
      get connected() {
        return network.connected;
      },
      on: (event, listener) => network.on(event, listener),
      reportFailure: () => network.reportFailure(),
      reportSuccess: () => network.reportSuccess(),
      flushAll: () => network.flushAll(),
      queue: (file, handler, options) =>
        network.queue(`modules/${name}/queue-${file}.json`, handler, options),
    };
  }

  /** Disposes every module, last set up first. Errors are logged; every module gets its turn. */
  dispose(): Promise<void> {
    this.disposed ??= (async () => {
      for (const dispose of this.disposers.reverse()) {
        try {
          await dispose();
        } catch (error) {
          console.error('[modules] dispose failed:', error);
        }
      }
    })();
    return this.disposed;
  }
}
