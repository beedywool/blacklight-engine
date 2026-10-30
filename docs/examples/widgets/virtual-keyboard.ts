// The on-screen keyboard as a modal: arrows pick keys, Enter types, Backspace or Escape deletes, Done closes.
import { Graphics, Scene, Text } from '@blacklight/core';
import { VirtualKeyboard } from '@blacklight/ui';

export default class Example extends Scene {
  private label!: Text;

  override create() {
    this.spawn(Graphics).draw.rect(0, 0, this.width, this.height).fill(0x181818);
    this.label = this.spawn(Text, {
      x: this.width / 2,
      y: 80,
      text: 'NAME: —',
      style: { fill: 0xffffff, fontFamily: 'system-ui, sans-serif', fontSize: 40 },
    });
    void this.ask();
  }

  private async ask() {
    const name = (await this.ui.modal(VirtualKeyboard, {
      value: 'Joker',
      maxLength: 12,
      title: 'NAME',
    })) as string | undefined;
    this.label.text = `NAME: ${name ?? '(cancelled)'}`;
    // Ask again so the preview keeps showing the keyboard.
    this.after(1500, () => void this.ask());
  }
}
