// Click anywhere: a "+10" fades in, rises, waits, fades out and destroys itself. The white ghost
// gets a new fade every two seconds with destroy: false, so it stays in the scene. Press X to fade
// it out now with fadeOut(ms).
import { Graphics, Scene, Text, behaviors, type Fade } from '@blacklight/core';

export default class Example extends Scene {
  ghost!: Graphics;
  fade!: Fade;

  override create() {
    this.ghost = this.spawn(Graphics, { x: 640, y: 380 });
    this.ghost.draw.circle(0, 0, 70).fill(0xffffff);
    this.haunt();
    this.every(2000, () => this.haunt());
    this.popup(640, 200);
  }

  haunt() {
    if (this.fade) this.ghost.removeBehavior(this.fade);
    this.fade = this.ghost.addBehavior(
      behaviors.fade({ fadeIn: 600, wait: 600, fadeOut: 600, destroy: false }),
    );
  }

  popup(x: number, y: number) {
    const text = this.spawn(Text, {
      x,
      y,
      text: '+10',
      style: { fill: 0xe60012, fontFamily: 'sans-serif', fontSize: 56, fontWeight: '700' },
    });
    text.addBehavior(behaviors.fade({ fadeIn: 150, wait: 500, fadeOut: 400 }));
    text.addBehavior(behaviors.bullet({ speed: 60, angle: -90 }));
  }

  override update() {
    if (this.pointer.pressed) this.popup(this.pointer.x, this.pointer.y);
    if (this.input.pressed('action')) this.fade.fadeOut(200);
  }
}
