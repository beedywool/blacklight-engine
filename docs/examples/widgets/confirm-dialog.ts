// `ui.confirm` asks a question: Cancel has the focus first; left and right switch, Enter answers.
import { Graphics, Scene, Text } from '@blacklight/core';

export default class Example extends Scene {
  private answer!: Text;

  override create() {
    this.spawn(Graphics).draw.rect(0, 0, this.width, this.height).fill(0x181818);
    this.answer = this.spawn(Text, {
      x: this.width / 2,
      y: 90,
      text: 'Waiting for an answer',
      style: { fill: 0xffffff, fontFamily: 'system-ui, sans-serif', fontSize: 36 },
    });
    void this.ask();
  }

  private async ask() {
    const quit = await this.ui.confirm({
      title: 'QUIT',
      message: 'Return to the title screen?',
      confirm: 'QUIT',
      danger: true,
    });
    this.answer.text = quit ? 'You chose QUIT' : 'You chose Cancel';
    this.after(1200, () => void this.ask());
  }
}
