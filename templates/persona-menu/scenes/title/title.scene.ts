import { Scene } from '@blacklight/core';

export default class Title extends Scene {
  override create() {
    this.ui.open('TitleScreen', {}, { enter: 'slash', leave: 'fade' });
  }
}
