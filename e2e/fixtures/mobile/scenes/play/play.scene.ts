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
    const restored = await this.load();
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
  }

  private tap(device: string) {
    this.taps++;
    this.report({ taps: String(this.taps), device });
    this.drawPad();
    this.save(this.taps);
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

  private async load(): Promise<number | undefined> {
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
    this.saving = this.saving.then(async () => {
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
