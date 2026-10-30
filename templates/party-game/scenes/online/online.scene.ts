import { Graphics, Scene } from '@blacklight/core';

/**
 * Online lobby: connect to a relay, host a room for a mini-game or join one with its code. When
 * the host starts, every machine goes to the match shell with the relay's match.
 */
export default class Online extends Scene {
  override create(): void {
    const floor = this.spawn(Graphics, { zIndex: -1 });
    floor.draw.rect(0, 0, 1920, 1080).fill(0x0c1220);
    for (let i = 0; i < 30; i++)
      floor.draw
        .circle((i * 337) % 1920, (i * 211) % 1080, 3 + (i % 4))
        .fill({ color: 0x2f7cf6, alpha: 0.4 });
    this.ui.open('OnlineLobby', {}, { enter: 'slash', leave: 'fade' });
  }
}
