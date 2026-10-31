import { Graphics, Scene } from '@blacklight/core';

const SAVE = 'saves/taps.sav';

/**
 * Counts taps and back presses. Every tap is saved, encrypted with the platform save key, so a
 * restarted app shows the count it had: `data-taps`, `data-restored`, `data-back` and
 * `data-platform` on the mount element tell tests what happened. `status.json` in the platform
 * files repeats them for tests that cannot reach the page (iOS Simulator).
 */
export default class Play extends Scene {
  private taps = 0;
  private backs = 0;
  private pad!: Graphics;
  private saving: Promise<void> = Promise.resolve();

  async create() {
    this.spawn(Graphics, { x: 0, y: 0 })
      .draw.rect(0, 0, this.width, this.height)
      .fill({ color: 0x101820 });
    this.pad = this.spawn(Graphics, { x: this.width / 2, y: this.height / 2 });
    this.report({
      platform: this.game.platform.name,
      location: this.game.platform.files.location ?? '',
    });
    this.game.platform.on('pause', () => this.report({ lifecycle: 'paused' }));
    this.game.platform.on('resume', () => this.report({ lifecycle: 'resumed' }));
    const restored = await this.loadSave();
    this.taps = restored ?? 0;
    this.report({
      restored: restored === undefined ? 'none' : String(restored),
      taps: String(this.taps),
    });
    this.drawPad();
    // `<id>://tap` counts like a tap: deep links work, and tests without touch (iOS Simulator)
    // can still make a save.
    this.game.platform.on('deeplink', (link) => {
      if ((link as { url: string }).url.endsWith('://tap')) this.tap('link');
    });
    await this.openDatabase();
  }

  /**
   * The `sqlite` native protocol, raw (what `@blacklight/module-sqlite` calls): one row per tap,
   * with a blob and a boolean, counted back into `data-sql`. Builds without native SQLite report
   * `unavailable`.
   */
  private sql = false;

  private async openDatabase() {
    const { platform } = this.game;
    try {
      await platform.invoke('sqlite', 'open', 'fixture.db');
      await platform.invoke(
        'sqlite',
        'execute',
        'fixture.db',
        'CREATE TABLE IF NOT EXISTS taps (n INTEGER, flag INTEGER, data BLOB); CREATE INDEX IF NOT EXISTS taps_n ON taps (n)',
      );
      this.sql = true;
      await this.countRows();
    } catch (error) {
      this.report({ sql: `unavailable: ${(error as Error).message}` });
    }
  }

  private async countRows() {
    const rows = await this.game.platform.invoke<Record<string, unknown>[]>(
      'sqlite',
      'query',
      'fixture.db',
      'SELECT COUNT(*) AS c, MAX(n) AS last FROM taps',
    );
    const blob = await this.game.platform.invoke<Record<string, unknown>[]>(
      'sqlite',
      'query',
      'fixture.db',
      'SELECT data, flag FROM taps WHERE n = ?',
      [rows[0]?.last ?? 0],
    );
    const data = blob[0]?.data;
    this.report({
      sql: String(rows[0]?.c),
      blob:
        data instanceof Uint8Array && data.join(',') === '7,0,255' && blob[0]?.flag === 1
          ? 'ok'
          : 'none',
    });
  }

  private tap(device: string) {
    this.taps++;
    this.report({ taps: String(this.taps), device });
    this.drawPad();
    this.save(this.taps);
    if (this.sql) {
      const n = this.taps;
      this.saving = this.saving
        .then(async () => {
          const result = await this.game.platform.invoke<{ changes: number; lastInsertId: number }>(
            'sqlite',
            'execute',
            'fixture.db',
            'INSERT INTO taps VALUES (?, ?, ?)',
            [n, true, new Uint8Array([7, 0, 255])],
          );
          this.report({ insert: `${result.changes}:${result.lastInsertId > 0}` });
          await this.countRows();
        })
        .catch((error: unknown) => {
          // Keep the save chain going; the test reads the error.
          this.report({ insert: `error: ${(error as Error).message}` });
        });
    }
  }

  private report(values: Record<string, string>) {
    Object.assign(this.game.mount.dataset, values);
    const status = new TextEncoder().encode(JSON.stringify({ ...this.game.mount.dataset }));
    this.saving = this.saving.then(() => this.game.platform.files.write('status.json', status));
  }

  private drawPad() {
    // Brighter with every tap: visible proof in screenshots.
    const level = Math.min(255, 60 + this.taps * 30);
    this.pad.draw
      .clear()
      .circle(0, 0, 120)
      .fill({ color: (level << 16) | (level << 8) | 255 });
  }

  private async key() {
    return this.game.platform.saveKey();
  }

  private async loadSave(): Promise<number | undefined> {
    const data = await this.game.platform.files.read(SAVE);
    if (!data) return undefined;
    const plain = await crypto.subtle.decrypt(
      { name: 'AES-GCM', iv: data.slice(0, 12) },
      await this.key(),
      data.slice(12),
    );
    return Number(new TextDecoder().decode(plain));
  }

  private save(taps: number) {
    this.saving = this.saving
      .then(async () => {
        const iv = crypto.getRandomValues(new Uint8Array(12));
        const sealed = new Uint8Array(
          await crypto.subtle.encrypt(
            { name: 'AES-GCM', iv },
            await this.key(),
            new TextEncoder().encode(String(taps)),
          ),
        );
        const file = new Uint8Array(12 + sealed.length);
        file.set(iv);
        file.set(sealed, 12);
        await this.game.platform.files.write(SAVE, file);
        this.report({ saved: String(taps) });
      })
      .catch((error: unknown) => {
        // Report instead of leaving an unhandled rejection: a failed encrypt or write (a Keychain
        // key the app cannot read, say) would otherwise stall `saved` with no reason in status.json.
        this.report({ saveError: (error as Error).message });
      });
  }

  update() {
    if (this.input.pointer.pressed && this.game.input.lastDevice === 'touch') this.tap('touch');
    if (this.input.pressed('back')) {
      this.backs++;
      this.report({ back: String(this.backs) });
    }
  }
}
