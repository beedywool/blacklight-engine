import { SaveError, Scene } from '@blacklight/core';
import { gamepad } from '@blacklight/native';
import type Player from '../../objects/player/player.object';

declare module '@blacklight/core' {
  interface SaveData {
    gold?: number;
  }
}

/**
 * Reports what the tests check on the mount element's data attributes, so release builds (no
 * `window.blacklight`) can be observed: save status, tamper events, protected values, gamepads.
 * Enter adds 10 gold and saves slot 1; Escape quits through the platform.
 */
export default class Main extends Scene {
  player!: Player;

  get status(): DOMStringMap {
    return this.game.mount.dataset;
  }

  override async create() {
    this.game.on('tamper', (event) => {
      this.status.tamper = `${event.kind}${event.path ? `:${event.path}` : ''}`;
      event.restore();
    });
    this.player = this.spawn('Player', { x: 320, y: 180 }) as Player;
    try {
      await this.game.save.load(1);
      this.status.save = 'loaded';
    } catch (error) {
      if (!(error instanceof SaveError)) throw error;
      this.status.save = error.code;
      this.status.backup = String(error.hasBackup);
      if (error.hasBackup) {
        await this.game.save.load(1, { backup: true });
        this.status.save += '+backup';
      } else {
        this.game.save.reset({ gold: 0 });
      }
    }
    this.status.gold = String(this.game.save.data.gold ?? 0);
    this.status.platform = this.game.platform.name;
    this.status.location = this.game.platform.files.location ?? '';
    const echo = await this.game.modules.echo.shout('hi');
    this.status.echo = `${echo.text}:${echo.gameId}`;
    await this.game.save.save('boot', { thumbnail: false });
    this.status.ready = '1';
  }

  override update() {
    if (this.input.pressed('confirm')) {
      const gold = (this.game.save.data.gold ?? 0) + 10;
      this.game.save.data.gold = gold;
      void this.game.save.save(1).then(() => (this.status.saved = String(gold)));
    }
    if (this.input.pressed('back')) this.game.platform.quit();
    const pads = this.game.input.gamepads;
    this.status.pads = pads.map((p) => `${p.id.split(' (')[0]}:${p.buttons[0]}`).join(',');
    this.status.led = String(pads.length > 0 && gamepad(this.game, pads[0]!.index).hasLed);
    this.status.protected = String(
      typeof Object.getOwnPropertyDescriptor(this.player, 'hp')?.get === 'function',
    );
  }
}
