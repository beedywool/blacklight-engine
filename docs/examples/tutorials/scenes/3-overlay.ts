// The countdown of the level stops at 0. Open the `results` scene over the level when it does.
import { Graphics, Scene, Text } from '@blacklight/core';

const label = (scene: Scene<never>, y: number, text: string, size = 48) =>
  scene.spawn(Text, {
    x: scene.width / 2,
    y,
    text,
    style: { fill: 0xededed, fontFamily: 'system-ui, sans-serif', fontSize: size },
  });

/** The entry scene: its name is `main` in an example (a project names it after its folder). */
export default class Title extends Scene {
  override create() {
    this.spawn(Graphics).draw.rect(0, 0, this.width, this.height).fill(0x181818);
    label(this, 300, 'TITLE', 96);
    label(this, 420, 'Enter: start', 32);
    this.after(1500, () => void this.goto('level', { number: 3 }));
  }

  override update() {
    if (this.input.pressed('confirm')) void this.goto('level', { number: 3 });
  }
}

/** A scene typed by its parameters: `goto('level', { number })` must pass a number. */
class Level extends Scene<{ number: number }> {
  private ball!: Graphics;
  private clock!: Text;
  private left = 3;
  private speed = 6;

  override create({ number }: { number: number }) {
    this.speed = 3 * number;
    this.spawn(Graphics).draw.rect(0, 0, this.width, this.height).fill(0x0d0d0d);
    label(this, 80, `LEVEL ${number}`, 48);
    this.clock = label(this, 640, '3', 48);
    this.ball = this.spawn(Graphics, { x: 100, y: this.height / 2 });
    this.ball.draw.circle(0, 0, 40).fill(0xffffff);
    this.every(1000, () => {
      if (this.left === 0) return;
      this.left--;
      this.clock.text = String(this.left);
    });
  }

  override update() {
    this.ball.x = 100 + ((this.steps * this.speed) % (this.width - 200));
    if (this.input.pressed('back')) void this.goto('main');
  }
}

/** Opened over the level; the level keeps drawing below it, paused. */
class Results extends Scene {
  override create() {
    this.spawn(Graphics)
      .draw.rect(0, 0, this.width, this.height)
      .fill({ color: 0x000000, alpha: 0.7 });
    label(this, this.height / 2, 'TIME UP: Enter goes back to the title', 48);
  }

  override update() {
    if (this.input.pressed('confirm')) void this.game.goto('main');
  }
}

/** The other scenes of this example, by name (a project has one folder per scene instead). */
export const scenes = { level: Level, results: Results };
