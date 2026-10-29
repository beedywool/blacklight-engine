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

  get<T>(key: string): T | undefined {
    return this.values[key] as T | undefined;
  }

  set(key: string, value: unknown): void {
    this.values[key] = value;
    this.save();
  }

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
