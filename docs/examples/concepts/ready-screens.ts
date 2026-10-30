// Ready-made screens: Escape opens the pause menu (it pauses the game; Settings, Save and Load work),
// Enter opens the settings directly.
import { Graphics, Scene, type GameConfig } from '@blacklight/core';
import { PauseScreen, SettingsScreen } from '@blacklight/ui';

// Its own id: settings and saves made here stay with this example.
export const config: Partial<GameConfig> = { id: 'dev.blacklight.example.screens' };

export default class Example extends Scene {
  override create() {
    this.spawn(Graphics).draw.rect(0, 0, this.width, this.height).fill(0x181818);
    for (let i = 0; i < 6; i++) {
      const block = this.spawn(Graphics, { x: 160 + i * 190, y: 360 });
      block.draw.rect(-60, -60, 120, 120).fill(i % 2 ? 0xe60012 : 0xffffff);
      // Game-time motion: it stops while the pause menu is open.
      this.every(16, () => (block.rotation += 0.02 * (i + 1)));
    }
  }

  override update() {
    // game.save.screenSlots() adapts the engine's saves to the save/load screens.
    if (this.input.pressed('pause'))
      this.ui.push(PauseScreen, { slots: this.game.save.screenSlots() });
    if (this.input.pressed('confirm')) this.ui.push(SettingsScreen);
  }
}
