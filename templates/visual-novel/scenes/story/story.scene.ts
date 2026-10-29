import { Graphics, Scene } from '@blacklight/core';
import { Dialogue, plainText, t, uiOf, type DialogueTag, type FxName } from '@blacklight/ui';
import { watch } from 'vue';
import { stories, unlock, type Saveable, type StorySave } from '@ui/state';

interface Params {
  /** Name typed on the title screen (a new game). */
  player?: string;
  /** A save to continue from. */
  restore?: StorySave;
}

/** Background art drawn in Pixi: sky bands, a skyline with lit windows, rain or a moon. */
const BACKGROUNDS: Record<
  string,
  { top: number; bottom: number; windows: number; moon?: boolean; rain?: boolean }
> = {
  street: { top: 0x1b2440, bottom: 0x05060a, windows: 0xe60012, rain: true },
  rooftop: { top: 0x3a1d4a, bottom: 0xff7a45, windows: 0xffd60a },
  night: { top: 0x0b1026, bottom: 0x000000, windows: 0x9ecbff, moon: true },
};

export default class Story extends Scene<Params> implements Saveable {
  dialogue!: Dialogue;
  background = 'street';
  player = 'Aoi';
  private art!: Graphics;
  private pendingTransition: string | undefined;
  private stopLocale: (() => void) | undefined;

  override create({ player, restore }: Params = {}) {
    const ui = uiOf(this.game);
    this.art = this.spawn(Graphics, { zIndex: -1 });
    this.dialogue = new Dialogue(stories, { game: this.game, locale: ui.i18n.locale.value });
    // A language switch in the settings continues the story in that language from the next line.
    this.stopLocale = watch(ui.i18n.locale, (lang) => this.dialogue.setLocale(lang));
    this.dialogue.events.on('tag', ({ tag }) => this.onTag(tag));
    this.dialogue.events.on('end', () => {
      void this.goto('title', undefined, { transition: 'shatter' });
    });
    if (restore) {
      this.player = restore.player;
      this.drawBackground(restore.background);
      this.dialogue.restore(restore.dialogue);
    } else {
      this.player = player ?? t('name.default');
      this.drawBackground('street');
      this.dialogue.start(undefined, { player: this.player });
    }
    this.ui.open('StoryScreen', { dialogue: this.dialogue });
  }

  override destroy() {
    this.stopLocale?.();
    this.dialogue.saveRead();
  }

  /** Tags the dialogue leaves to the game: backgrounds, transitions, effects, gallery unlocks. */
  private onTag(tag: DialogueTag) {
    switch (tag.name) {
      case 'transition':
        this.pendingTransition = tag.value;
        break;
      case 'bg': {
        const effect = this.pendingTransition;
        this.pendingTransition = undefined;
        if (effect && tag.value !== this.background)
          void uiOf(this.game).cover(effect, () => this.drawBackground(tag.value));
        else this.drawBackground(tag.value);
        break;
      }
      case 'fx':
        void uiOf(this.game).fx.pulse(tag.value as FxName, { duration: 800 });
        break;
      case 'unlock':
        unlock(this.game, tag.value);
        break;
    }
  }

  private drawBackground(name: string) {
    const bg = BACKGROUNDS[name] ?? BACKGROUNDS.street!;
    this.background = name;
    const draw = this.art.draw.clear();
    for (let i = 0; i < 12; i++) {
      const t = i / 11;
      const mix = (shift: number) =>
        Math.round(((bg.top >> shift) & 0xff) * (1 - t) + ((bg.bottom >> shift) & 0xff) * t);
      draw.rect(-960, i * 92, 3840, 94).fill((mix(16) << 16) | (mix(8) << 8) | mix(0));
    }
    if (bg.moon) draw.circle(1500, 220, 90).fill(0xf2f2f2);
    for (let i = 0; i < 18; i++) {
      const x = -560 + i * 170;
      const h = 220 + ((i * 137) % 380);
      draw.rect(x, 1080 - h, 150, h).fill(0x07070b);
      for (let w = 0; w < 6; w++) {
        if ((i * 7 + w * 3) % 4 === 0)
          draw
            .rect(x + 20 + (w % 3) * 42, 1080 - h + 30 + Math.floor(w / 3) * 60, 22, 30)
            .fill(bg.windows);
      }
    }
    if (bg.rain) {
      for (let i = 0; i < 140; i++) {
        const x = ((i * 389) % 2900) - 480;
        const y = (i * 211) % 1080;
        draw.moveTo(x, y).lineTo(x - 14, y + 46);
      }
      draw.stroke({ color: 0x9ecbff, alpha: 0.35, width: 2 });
    }
  }

  saveData(): StorySave {
    return { dialogue: this.dialogue.state(), background: this.background, player: this.player };
  }

  summary() {
    const line = this.dialogue.line;
    const speaker = line?.speaker ? `${t(`speakers.${line.speaker}`, {}, line.speaker)}: ` : '';
    return {
      label: t('story.chapter'),
      summary: line ? `${speaker}${plainText(line.text)}`.slice(0, 80) : '',
    };
  }
}
