import {
  DropItem,
  EventBus,
  defineModule,
  t,
  type ModuleContext,
  type ModuleSaves,
  type Schema,
  type Unsubscribe,
} from '@blacklight/core';
import { HttpError, type Http } from '@blacklight/module-http';

/** Options of the `cloud-save` module in `game.config.ts`, with their defaults applied. */
export interface CloudSaveConfig {
  /**
   * `server`: the reference server; `steam`: Steam Cloud (Steam builds).
   * @defaultValue `'server'`
   */
  backend: 'server' | 'steam';
  /** Reference server URL; unset, the `server` of the accounts-oidc module is used. */
  server: string | undefined;
  /**
   * When both copies changed: keep the `newest`, or `ask` the game (`onConflict`).
   * @defaultValue `'newest'`
   */
  conflict: 'newest' | 'ask';
  /** Upload each slot after the game saves it. @defaultValue `true` */
  autoUpload: boolean;
  /** Sync every slot when the game starts and when the app resumes. @defaultValue `true` */
  syncOnStart: boolean;
}

/** What `game.config.ts` may write under `modules['cloud-save']`: every option is optional. */
export type CloudSaveConfigInput = Partial<CloudSaveConfig>;

const config: Schema<CloudSaveConfig, CloudSaveConfigInput> = t.object({
  backend: t.enum(['server', 'steam']).default('server'),
  server: t.string({ url: true }).optional(),
  conflict: t.enum(['newest', 'ask']).default('newest'),
  autoUpload: t.boolean().default(true),
  syncOnStart: t.boolean().default(true),
});

/** One copy of a slot. */
export interface SlotCopy {
  /** Name of the save slot, e.g. `'slot-1'`. */
  slot: string;
  /** Last write, ms since the epoch (the writing device's clock). */
  updatedAt: number;
  /** The slot's save file, as the save system exports it (signed, possibly encrypted). */
  data: Uint8Array;
}

/** Both copies of a slot changed since the last sync. */
export interface SaveConflict {
  /** Name of the save slot. */
  slot: string;
  /** The copy on this device. */
  local: SlotCopy;
  /** The copy in the cloud. */
  remote: SlotCopy;
}

/** Which copy to keep. */
export type Resolution = 'local' | 'remote';

/** Events of the cloud-save module. */
export interface CloudSaveEvents {
  /** A slot was uploaded. */
  uploaded: {
    /** Name of the uploaded slot. */
    slot: string;
  };
  /** A slot was replaced by the cloud copy. */
  downloaded: {
    /** Name of the replaced slot. */
    slot: string;
  };
  /** A conflict was resolved (by the policy or the game). */
  conflict: SaveConflict & {
    /** The copy that won. */
    kept: Resolution;
  };
  /** A sync failed; it is retried later. */
  error: Error;
}

interface Remote {
  slot: string;
  revision: number;
  updatedAt: number;
}

interface Synced {
  /** Server revision (Steam: remote updatedAt) at the last sync. */
  revision: number;
  /** Local updatedAt at the last sync. */
  local: number;
}

const b64 = {
  encode(data: Uint8Array): string {
    let text = '';
    for (let i = 0; i < data.length; i += 0x8000) {
      text += String.fromCharCode(...data.subarray(i, i + 0x8000));
    }
    return btoa(text);
  },
  decode(text: string): Uint8Array {
    return Uint8Array.from(atob(text), (c) => c.charCodeAt(0));
  },
};

/** Where copies live: the reference server or Steam Cloud. */
interface Store {
  list(): Promise<Remote[]>;
  read(slot: string): Promise<(Remote & { data: Uint8Array }) | undefined>;
  /** Writes when the remote is still at `base` (undefined: overwrite); returns the new revision. */
  write(slot: string, copy: SlotCopy, base: number | undefined): Promise<number | 'conflict'>;
}

function serverStore(http: Http, base: string): Store {
  return {
    async list() {
      return (await http.get<{ saves: Remote[] }>(`${base}/saves`)).saves;
    },
    async read(slot) {
      try {
        const data = await http.get<Remote & { data: string }>(
          `${base}/saves/${encodeURIComponent(slot)}`,
        );
        return { ...data, data: b64.decode(data.data) };
      } catch (error) {
        if (error instanceof HttpError && error.status === 404) return undefined;
        throw error;
      }
    },
    async write(slot, copy, baseRevision) {
      try {
        const result = await http.put<Remote>(`${base}/saves/${encodeURIComponent(slot)}`, {
          data: b64.encode(copy.data),
          updatedAt: copy.updatedAt,
          ...(baseRevision === undefined ? {} : { baseRevision }),
        });
        return result.revision;
      } catch (error) {
        if (error instanceof HttpError && error.status === 409) return 'conflict';
        throw error;
      }
    },
  };
}

/**
 * Steam Cloud through the desktop package: `steam.cloudWrite(name, base64)`,
 * `steam.cloudRead(name) → base64 | null`, `steam.cloudList() → { name }[]`. A small
 * `<slot>.meta` file holds the write time, Steam keeps the bytes.
 */
function steamStore(context: ModuleContext<CloudSaveConfig>): Store {
  const call = <T>(method: string, ...args: unknown[]) =>
    context.platform.invoke<T>('steam', method, ...args);
  const meta = async (slot: string): Promise<number | undefined> => {
    const text = await call<string | null>('cloudRead', `${slot}.meta`);
    if (!text) return undefined;
    const value = Number(JSON.parse(new TextDecoder().decode(b64.decode(text))).updatedAt);
    return Number.isFinite(value) ? value : undefined;
  };
  return {
    async list() {
      const files = await call<{ name: string }[]>('cloudList');
      const slots = files.map((f) => f.name).filter((n) => !n.endsWith('.meta'));
      const out: Remote[] = [];
      for (const slot of slots) {
        const updatedAt = (await meta(slot)) ?? 0;
        out.push({ slot, revision: updatedAt, updatedAt });
      }
      return out;
    },
    async read(slot) {
      const data = await call<string | null>('cloudRead', slot);
      if (!data) return undefined;
      const updatedAt = (await meta(slot)) ?? 0;
      return { slot, revision: updatedAt, updatedAt, data: b64.decode(data) };
    },
    async write(slot, copy, base) {
      if (base !== undefined && ((await meta(slot)) ?? 0) !== base) return 'conflict';
      const stamp = new TextEncoder().encode(JSON.stringify({ updatedAt: copy.updatedAt }));
      await call('cloudWrite', slot, b64.encode(copy.data));
      await call('cloudWrite', `${slot}.meta`, b64.encode(stamp));
      return copy.updatedAt;
    },
  };
}

function createCloudSave(context: ModuleContext<CloudSaveConfig>) {
  const { config, storage, log } = context;
  const events = new EventBus<CloudSaveEvents>();
  const accounts = (
    context.game.config.modules as Record<string, { server?: string }> | undefined
  )?.['accounts-oidc'];
  const server = (config.server ?? accounts?.server)?.replace(/\/+$/, '');
  if (config.backend === 'server' && !server) {
    throw new Error(
      'cloud-save needs `server` (the reference server URL) here or in the accounts-oidc options, or `backend: "steam"`.',
    );
  }
  const store =
    config.backend === 'steam'
      ? steamStore(context)
      : serverStore(
          context.modules.http as Http,
          `${server}/v1/games/${encodeURIComponent(context.game.config.id)}`,
        );
  let synced: Record<string, Synced> = {};
  let resolver: ((conflict: SaveConflict) => Resolution | Promise<Resolution>) | undefined;

  const saves = (): ModuleSaves => {
    const found = context.saves;
    if (!found) {
      throw new Error(
        'cloud-save needs the save system (game.save): it syncs the slots the game writes. Use upload() / download() with your own bytes otherwise.',
      );
    }
    return found;
  };

  const remember = async (slot: string, revision: number, local: number) => {
    synced[slot] = { revision, local };
    await storage.set('synced', synced);
  };

  const localCopy = async (slot: string): Promise<SlotCopy | undefined> => {
    const info = (await saves().slots()).find((s) => s.slot === slot);
    const data = await saves().exportSlot(slot);
    return info && data ? { slot, updatedAt: info.updatedAt, data } : undefined;
  };

  const resolve = async (conflict: SaveConflict): Promise<Resolution> => {
    let kept: Resolution =
      conflict.remote.updatedAt > conflict.local.updatedAt ? 'remote' : 'local';
    if (config.conflict === 'ask' && resolver) kept = await resolver(conflict);
    events.emit('conflict', { ...conflict, kept });
    return kept;
  };

  const download = async (remote: Remote & { data: Uint8Array }) => {
    await saves().importSlot(remote.slot, remote.data);
    const after = (await saves().slots()).find((s) => s.slot === remote.slot);
    await remember(remote.slot, remote.revision, after?.updatedAt ?? remote.updatedAt);
    events.emit('downloaded', { slot: remote.slot });
  };

  const push = async (copy: SlotCopy, force = false): Promise<void> => {
    const base = force ? undefined : (synced[copy.slot]?.revision ?? 0);
    const result = await store.write(copy.slot, copy, base);
    if (result !== 'conflict') {
      await remember(copy.slot, result, copy.updatedAt);
      events.emit('uploaded', { slot: copy.slot });
      return;
    }
    const remote = await store.read(copy.slot);
    if (!remote) return push(copy, true);
    const kept = await resolve({ slot: copy.slot, local: copy, remote });
    if (kept === 'local') await push(copy, true);
    else await download(remote);
  };

  /** Brings one slot in line with the cloud. */
  const syncSlot = async (slot: string, remote: Remote | undefined): Promise<void> => {
    const local = await localCopy(slot);
    const last = synced[slot];
    const localChanged = !!local && (!last || local.updatedAt !== last.local);
    const remoteChanged = !!remote && (!last || remote.revision !== last.revision);
    if (local && !remote) return push(local);
    if (!local && remote) {
      const full = await store.read(slot);
      if (full) await download(full);
      return;
    }
    if (!local || !remote) return;
    if (localChanged && !remoteChanged) return push(local);
    if (remoteChanged && !localChanged) {
      const full = await store.read(slot);
      if (full) await download(full);
      return;
    }
    if (localChanged && remoteChanged) {
      const full = await store.read(slot);
      if (!full) return push(local, true);
      if (sameBytes(full.data, local.data)) return remember(slot, full.revision, local.updatedAt);
      const kept = await resolve({ slot, local, remote: full });
      if (kept === 'local') await push(local, true);
      else await download(full);
    }
  };

  const queue = context.network.queue<{ slot: string }>(
    'uploads',
    async ({ slot }) => {
      try {
        // Upload what the slot holds now: several saves while offline send one copy.
        const copy = await localCopy(slot);
        if (copy) await push(copy);
      } catch (error) {
        if (error instanceof HttpError && error.status === 401) throw error; // waits for a session
        if (error instanceof HttpError && error.status === 413) throw new DropItem(error.message);
        throw error;
      }
    },
    { retryDelay: 2000 },
  );

  const api = {
    /** Backend in use. */
    backend: config.backend,
    /** Uploads waiting for the network or a session. */
    get pending(): number {
      return queue.size;
    },
    /**
     * Syncs every slot: uploads local changes, downloads remote ones, resolves slots changed on
     * both sides with the `conflict` policy.
     */
    async sync(): Promise<void> {
      const remote = await store.list();
      const local = (await saves().slots()).map((s) => s.slot);
      const slots = new Set([...local, ...remote.map((r) => r.slot)]);
      for (const slot of slots)
        await syncSlot(
          slot,
          remote.find((r) => r.slot === slot),
        );
    },
    /** Queues an upload of a slot (done automatically after each save with `autoUpload`). */
    async upload(slot: string): Promise<void> {
      const queued = queue.pending().some((item) => item.slot === slot);
      if (!queued) await queue.push({ slot });
      else await queue.flush();
    },
    /** Replaces the local slot with the cloud copy; `false` when the cloud has none. */
    async download(slot: string): Promise<boolean> {
      const remote = await store.read(slot);
      if (!remote) return false;
      await download(remote);
      return true;
    },
    /**
     * Decides conflicts when `conflict` is `'ask'` (show both copies to the player). Without a
     * handler the newest copy wins.
     */
    onConflict(handler: (conflict: SaveConflict) => Resolution | Promise<Resolution>): Unsubscribe {
      resolver = handler;
      return () => {
        if (resolver === handler) resolver = undefined;
      };
    },
    /** Listens to `uploaded`, `downloaded`, `conflict` and `error`. */
    on<E extends keyof CloudSaveEvents>(
      event: E,
      listener: (payload: CloudSaveEvents[E]) => void,
    ): Unsubscribe {
      return events.on(event, listener);
    },
  };

  return {
    api,
    async start() {
      synced = (await storage.get<Record<string, Synced>>('synced')) ?? {};
      const found = context.saves;
      if (!found) {
        log.debug('no save system: automatic sync is off');
        return;
      }
      if (config.autoUpload) context.onDispose(found.onSaved((slot) => void api.upload(slot)));
      if (config.syncOnStart) {
        const run = () =>
          api.sync().catch((error: unknown) => {
            events.emit('error', error instanceof Error ? error : new Error(String(error)));
          });
        void run();
        context.onDispose(context.platform.on('resume', () => void run()));
      }
    },
  };
}

function sameBytes(a: Uint8Array, b: Uint8Array): boolean {
  return a.length === b.length && a.every((value, i) => value === b[i]);
}

/** API of the `cloud-save` module: `game.modules['cloud-save']`. */
export type CloudSave = ReturnType<typeof createCloudSave>['api'];

/**
 * Cloud saves (SV-06, MOD-06): the slots of the save system are uploaded to the reference server
 * or Steam Cloud after each save (queued while offline or signed out) and synced at startup.
 * When both copies changed, the newest wins or the game asks the player (`conflict: 'ask'`).
 *
 * @example
 * ```ts
 * // game.config.ts
 * modules: {
 *   http: {},
 *   'accounts-oidc': { preset: 'blacklight', clientId: 'my-game', server: 'https://game.example.com' },
 *   'cloud-save': { conflict: 'ask' },
 * }
 *
 * // let the player choose
 * this.game.modules['cloud-save'].onConflict(async ({ local, remote }) =>
 *   (await this.ui.modal(PickSave, { local, remote })) as 'local' | 'remote',
 * );
 * ```
 */
export const cloudSave = defineModule({
  name: 'cloud-save',
  version: '0.0.0',
  config,
  dependencies: ['http'],
  async setup(context) {
    const created = createCloudSave(context);
    await created.start();
    return created.api;
  },
});
