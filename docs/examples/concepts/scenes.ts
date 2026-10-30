// Click the preview, press Enter to start a level, Escape to open the pause overlay over it.
import { Graphics, Scene, Text } from '@blacklight/core';

const label = (scene: Scene<never>, y: number, text: string, size = 48) =>
  scene.spawn(Text, {
    x: scene.width / 2,
    y,
    text,
    style: { fill: 0xededed, fontFamily: 'system-ui, sans-serif', fontSize: size },
  });

/** The entry scene (`main`): waits for confirm, then switches with parameters. */
export default class Title extends Scene {
  override create() {
    this.spawn(Graphics).draw.rect(0, 0, this.width, this.height).fill(0x181818);
    label(this, 300, 'TITLE', 96);
    label(this, 420, 'Enter: start level 3', 32);
  }

  override update() {
    if (this.input.pressed('confirm'))
      void this.goto('level', { number: 3 }, { transition: 'fade' });
  }
}

/** A scene typed by its parameters. */
class Level extends Scene<{ number: number }> {
  private ball!: Graphics;

  override create({ number }: { number: number }) {
    this.spawn(Graphics).draw.rect(0, 0, this.width, this.height).fill(0x0d0d0d);
    label(this, 80, `LEVEL ${number}   Escape: pause   Backspace: title`, 32);
    this.ball = this.spawn(Graphics, { x: 100, y: this.height / 2 });
    this.ball.draw.circle(0, 0, 40).fill(0xffffff);
  }

  override update() {
    // Stops while the pause overlay is open: `pauseBelow` is true by default.
    this.ball.x = 100 + ((this.steps * 6) % (this.width - 200));
    if (this.input.pressed('pause')) void this.game.overlay('pause');
    else if (this.input.pressed('back')) void this.goto('main');
  }
}

/** Opened over the level; the level keeps drawing below it. */
class Pause extends Scene {
  override create() {
    this.spawn(Graphics)
      .draw.rect(0, 0, this.width, this.height)
      .fill({ color: 0x000000, alpha: 0.6 });
    label(this, this.height / 2, 'PAUSED: Enter resumes', 64);
  }

  override update() {
    if (this.input.pressed('confirm')) this.game.closeOverlay(this);
  }
}

/** Extra scenes of this example, by name (a project has one folder per scene instead). */
export const scenes = { level: Level, pause: Pause };
