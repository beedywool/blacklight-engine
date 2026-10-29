import {
  DropItem,
  EventBus,
  defineModule,
  t,
  type Infer,
  type ModuleContext,
  type OfflineQueue,
  type Unsubscribe,
} from '@blacklight/core';
import { HttpError, type Http } from '@blacklight/module-http';

const config = t.object({
  /**
   * Where unlocks and scores go. `auto`: Steam when started by Steam, Game Center on iOS, Google
   * Play Games on Android, the reference server when `server` is set, otherwise the device only.
   */
  backend: t.enum(['auto', 'steam', 'gamecenter', 'playgames', 'server', 'local']).default('auto'),
  /** Reference server URL; defaults to the `server` of the accounts-oidc module. */
  server: t.string({ url: true }).optional(),
  /** Known achievement ids: `unlock()` refuses others, so a typo fails in development. */
  ids: t.array(t.string({ pattern: /^[A-Za-z0-9_.-]{1,64}$/ })).optional(),
});

/** Options of the `achievements` module in `game.config.ts`. */
export type AchievementsConfig = Infer<typeof config>;

/** A backend name after `auto` is resolved. */
export type AchievementBackend = 'steam' | 'gamecenter' | 'playgames' | 'server' | 'local';

/** An unlocked achievement. */
export interface Unlocked {
  id: string;
  /** ms since the epoch, on the device that unlocked it. */
  unlockedAt: number;
}

/** A leaderboard row. */
export interface LeaderboardEntry {
  rank: number;
  name: string;
  score: number;
}

/** Events of the achievements module. */
export interface AchievementEvents {
  /** Unlocked on this device (delivery to the backend may come later). */
  unlock: Unlocked;
  /** Progress changed. */
  progress: { id: string; current: number; max: number };
  /** Every queued unlock and score reached the backend. */
  synced: void;
}

type Job =
  | { kind: 'unlock'; id: string; unlockedAt: number }
  | { kind: 'score'; board: string; score: number };

/** Native method names called on each platform service (see DECISIONS.md). */
const NATIVE = {
  steam: { unlock: 'activateAchievement', score: 'uploadScore', scores: 'getScores' },
  gamecenter: { unlock: 'unlock', score: 'submitScore', scores: 'scores' },
  playgames: { unlock: 'unlock', score: 'submitScore', scores: 'scores' },
} as const;

function serverOf(context: ModuleContext<AchievementsConfig>): string | undefined {
  const accounts = (
    context.game.config.modules as Record<string, { server?: string }> | undefined
  )?.['accounts-oidc'];
  return (context.config.server ?? accounts?.server)?.replace(/\/+$/, '');
}

function pickBackend(context: ModuleContext<AchievementsConfig>): AchievementBackend {
  const { backend } = context.config;
  if (backend !== 'auto') return backend;
  const { platform } = context;
  if (platform.steam) return 'steam';
  if (platform.name === 'ios') return 'gamecenter';
  if (platform.name === 'android') return 'playgames';
  return serverOf(context) ? 'server' : 'local';
}

function createAchievements(context: ModuleContext<AchievementsConfig>) {
  const { platform, storage, log } = context;
  const http = context.modules.http as Http;
  const backend = pickBackend(context);
  const server = serverOf(context);
  const base = server && `${server}/v1/games/${encodeURIComponent(context.game.config.id)}`;
  if (backend === 'server' && !base) {
    throw new Error(
      'achievements: the "server" backend needs `server` (the reference server URL) here or in the accounts-oidc options.',
    );
  }
  const events = new EventBus<AchievementEvents>();
  let unlocked: Record<string, number> = {};
  let progress: Record<string, { current: number; max: number }> = {};

  const deliver = async (job: Job): Promise<void> => {
    if (backend === 'local') return;
    if (backend === 'server') {
      try {
        if (job.kind === 'unlock') {
          await http.post(`${base}/achievements/${encodeURIComponent(job.id)}`, {
            unlockedAt: job.unlockedAt,
          });
        } else {
          await http.post(`${base}/leaderboards/${encodeURIComponent(job.board)}/scores`, {
            score: job.score,
          });
        }
      } catch (error) {
        // Not signed in yet: keep the job until a session exists.
        if (error instanceof HttpError && error.status === 401) throw error;
        if (
          error instanceof HttpError &&
          error.status >= 400 &&
          error.status < 500 &&
          error.status !== 429
        ) {
          throw new DropItem(error.message);
        }
        throw error;
      }
      return;
    }
    const names = NATIVE[backend];
    if (job.kind === 'unlock') await platform.invoke(backend, names.unlock, job.id);
    else await platform.invoke(backend, names.score, job.board, job.score);
  };

  const queue: OfflineQueue<Job> = context.network.queue<Job>('jobs', deliver, {
    retryDelay: 2000,
  });
  queue.events.on('drained', () => events.emit('synced'));
  queue.events.on('failed', ({ item, error, willRetry }) => {
    if (!willRetry) log.warn(`dropped ${item.kind} ${'id' in item ? item.id : item.board}:`, error);
  });

  const check = (id: string) => {
    if (context.config.ids && !context.config.ids.includes(id)) {
      throw new Error(
        `Unknown achievement "${id}". Known ids (modules.achievements.ids): ${context.config.ids.join(', ')}.`,
      );
    }
  };

  const api = {
    /** Backend in use after `auto` was resolved. */
    backend,
    /** Unlocks and scores waiting to reach the backend (offline, not signed in…). */
    get pending(): number {
      return queue.size;
    },
    /**
     * Unlocks an achievement: recorded on the device at once, delivered to the backend now or
     * when the network (or a session) comes back. Returns `false` when it was already unlocked.
     */
    async unlock(id: string): Promise<boolean> {
      check(id);
      if (unlocked[id] !== undefined) return false;
      const unlockedAt = Date.now();
      unlocked[id] = unlockedAt;
      await storage.set('unlocked', unlocked);
      events.emit('unlock', { id, unlockedAt });
      await queue.push({ kind: 'unlock', id, unlockedAt });
      return true;
    },
    /** `true` once `id` is unlocked on this device or the backend. */
    isUnlocked(id: string): boolean {
      return unlocked[id] !== undefined;
    },
    /** Every unlocked achievement, oldest first. */
    list(): Unlocked[] {
      return Object.entries(unlocked)
        .map(([id, unlockedAt]) => ({ id, unlockedAt }))
        .sort((a, b) => a.unlockedAt - b.unlockedAt);
    },
    /** Records progress (kept on the device); reaching `max` unlocks the achievement. */
    async progress(id: string, current: number, max: number): Promise<void> {
      check(id);
      if (unlocked[id] !== undefined) return;
      const value = Math.min(current, max);
      progress[id] = { current: value, max };
      await storage.set('progress', progress);
      events.emit('progress', { id, current: value, max });
      if (value >= max) await api.unlock(id);
    },
    /** Progress recorded with {@link progress}. */
    progressOf(id: string): { current: number; max: number } | undefined {
      return progress[id];
    },
    /** Sends a score to a leaderboard (queued like unlocks). */
    async submitScore(board: string, score: number): Promise<void> {
      if (!Number.isFinite(score))
        throw new Error(`The score for "${board}" must be a finite number.`);
      await queue.push({ kind: 'score', board, score });
    },
    /**
     * Reads a leaderboard from the backend (needs the network).
     *
     * @throws Error on the `local` backend, which has no shared leaderboards.
     */
    async leaderboard(
      board: string,
      options: { limit?: number; offset?: number } = {},
    ): Promise<LeaderboardEntry[]> {
      const limit = options.limit ?? 10;
      if (backend === 'server') {
        const data = await http.get<{ entries: LeaderboardEntry[] }>(
          `${base}/leaderboards/${encodeURIComponent(board)}`,
          { query: { limit, offset: options.offset ?? 0 } },
        );
        return data.entries.map(({ rank, name, score }) => ({ rank, name, score }));
      }
      if (backend === 'local') {
        throw new Error(
          'Leaderboards need a backend: set `server`, or run on Steam, iOS or Android.',
        );
      }
      return platform.invoke<LeaderboardEntry[]>(backend, NATIVE[backend].scores, board, limit);
    },
    /**
     * Merges unlocks from the backend (another device) and resends the queue. The server backend
     * only; platform services sync themselves.
     */
    async sync(): Promise<void> {
      if (backend === 'server') {
        const remote = await http.get<{ achievements: Unlocked[] }>(`${base}/achievements`);
        let changed = false;
        for (const { id, unlockedAt } of remote.achievements) {
          if (unlocked[id] === undefined || unlocked[id]! > unlockedAt) {
            const known = unlocked[id] !== undefined;
            unlocked[id] = unlockedAt;
            changed = true;
            if (!known) events.emit('unlock', { id, unlockedAt });
          }
        }
        const remoteIds = new Set(remote.achievements.map((a) => a.id));
        const queued = new Set(
          queue.pending().flatMap((job) => (job.kind === 'unlock' ? [job.id] : [])),
        );
        for (const [id, unlockedAt] of Object.entries(unlocked)) {
          if (!remoteIds.has(id) && !queued.has(id))
            await queue.push({ kind: 'unlock', id, unlockedAt });
        }
        if (changed) await storage.set('unlocked', unlocked);
      }
      await queue.flush();
    },
    /** Clears the achievements recorded on this device (development builds only). */
    async reset(): Promise<void> {
      if (!context.dev) throw new Error('achievements.reset() only works in development builds.');
      unlocked = {};
      progress = {};
      await storage.remove('unlocked');
      await storage.remove('progress');
      await queue.clear();
    },
    /** Listens to `unlock`, `progress` and `synced`. */
    on<E extends keyof AchievementEvents>(
      event: E,
      listener: (payload: AchievementEvents[E]) => void,
    ): Unsubscribe {
      return events.on(event, listener);
    },
  };

  return {
    api,
    async load() {
      unlocked = (await storage.get<Record<string, number>>('unlocked')) ?? {};
      progress =
        (await storage.get<Record<string, { current: number; max: number }>>('progress')) ?? {};
    },
  };
}

/** API of the `achievements` module: `game.modules.achievements`. */
export type Achievements = ReturnType<typeof createAchievements>['api'];

/**
 * Achievements and leaderboards behind one API (SVC-02): Steam (`platform.invoke('steam', …)`),
 * Game Center and Google Play Games (`'gamecenter'`, `'playgames'`), or the reference server.
 * Unlocks are recorded on the device first and queued, so they survive being offline or signed
 * out.
 *
 * @example
 * ```ts
 * // game.config.ts
 * modules: { http: {}, achievements: { ids: ['first-win', 'collector'] } }
 *
 * // when the player wins
 * await this.game.modules.achievements.unlock('first-win');
 * await this.game.modules.achievements.submitScore('high-score', 1200);
 * ```
 */
export const achievements = defineModule({
  name: 'achievements',
  version: '0.0.0',
  config,
  dependencies: ['http'],
  async setup(context) {
    const created = createAchievements(context);
    await created.load();
    return created.api;
  },
});
