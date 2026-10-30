// A video as a game object (looping, muted), and Enter plays it as a cutscene with subtitles
// (hold Enter to skip). The browser picks intro.webm or intro.mp4, whichever it can play.
import { Graphics, Scene, Text, Video } from '@blacklight/core';
import { playCutscene, type UiStack } from '@blacklight/ui';

export default class Example extends Scene {
  static override assets = ['@assets/video/'];
  private playing = false;

  override create() {
    this.spawn(Graphics).draw.rect(0, 0, this.width, this.height).fill(0x181818);
    const screen = this.spawn(Video, { source: 'intro', loop: true, x: this.width / 2, y: 330 });
    screen.scale.set(1.4);
    // Start once the browser can play it.
    screen.element?.addEventListener('canplay', () => void screen.play(), { once: true });
    this.spawn(Text, {
      x: this.width / 2,
      y: 650,
      text: 'Enter: play as a cutscene',
      style: { fill: 0xededed, fontFamily: 'system-ui, sans-serif', fontSize: 32 },
    });
  }

  override update() {
    if (!this.input.pressed('confirm') || this.playing) return;
    this.playing = true;
    // A pushed screen over everything; resolves with 'ended' or 'skipped'.
    void playCutscene(this.ui as UiStack, 'intro', { subtitles: 'intro-en' }).then(
      () => (this.playing = false),
    );
  }
}
