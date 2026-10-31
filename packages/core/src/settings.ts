/**
 * Player settings (volumes, rebinding, language…) saved on the device. Values are JSON.
 *
 * @example
 * ```ts
 * game.settings.set('subtitles', true);
 * game.settings.get<boolean>('subtitles');
 * ```
 */
export class Settings {
  private values: Record<string, unknown> = {};

  constructor(private readonly storageKey: string) {
    try {
      this.values = JSON.parse(globalThis.localStorage?.getItem(storageKey) ?? '{}') as Record<
        string,
        unknown
      >;
    } catch {
      this.values = {};
    }
  }

  /** Reads a setting, `undefined` when it was never set. */
  get<T>(key: string): T | undefined {
    return this.values[key] as T | undefined;
  }

  /** Writes a JSON-serializable setting and saves every setting at once. */
  set(key: string, value: unknown): void {
    this.values[key] = value;
    this.save();
  }

  /** Removes a setting, so the game's default applies again. */
  delete(key: string): void {
    delete this.values[key];
    this.save();
  }

  private save(): void {
    try {
      globalThis.localStorage?.setItem(this.storageKey, JSON.stringify(this.values));
    } catch {
      // Private browsing or full storage: the setting lasts for this session only.
    }
  }
}
