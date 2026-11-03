<script setup lang="ts">
import {
  onUiStep,
  Counter,
  InputPrompt,
  MenuList,
  Skew,
  useGame,
  useScreen,
  useTimeline,
  useUi,
} from '@blacklight/ui';
import { onMounted, ref } from 'vue';

const game = useGame();
const ui = useUi();
const screen = useScreen({ enter: 'slash', leave: 'fade' });
const items = [
  { label: 'RESUME', value: 'resume' },
  { label: 'PARTY', value: 'party' },
  { label: 'ITEMS', value: 'items' },
  { label: 'TACTICS', value: 'tactics' },
  { label: 'SETTINGS', value: 'settings' },
  { label: 'QUIT', value: 'quit' },
];
const money = ref(48200);
const backdrop = ref<HTMLElement | null>(null);
const panel = ref<HTMLElement | null>(null);

const intro = useTimeline()
  .to(backdrop, { x: ['-100%', '0%'] }, { duration: 0.28, ease: [0.05, 0.7, 0.1, 1] })
  .label('content')
  .to('.pause .bl-menu__item', { x: [-120, 0], opacity: [0, 1] }, { at: 'content', duration: 0.18 })
  .to(panel, { y: [60, 0], opacity: [0, 1] }, { at: 'content+0.05', duration: 0.22 });
onMounted(() => void intro.play());

// Start closes the menu like Back. Escape is both: Back already handled it (and may have closed a
// submenu this very step), so Pause only counts on its own.
onUiStep(
  () => {
    const input = game.input.uiPlayer(1);
    if (input.pressed('pause') && !input.pressed('back')) screen.close();
  },
  { onlyOnTop: true },
);

async function select(value: string) {
  switch (value) {
    case 'resume':
      screen.close();
      break;
    case 'party':
      ui.push('Party');
      break;
    case 'items':
      ui.push('Items');
      break;
    case 'tactics':
      ui.modal('Tactics');
      break;
    case 'settings':
      ui.push('Settings');
      break;
    case 'quit':
      if (
        await ui.confirm({
          title: 'QUIT',
          message: 'Return to the title screen?',
          confirm: 'QUIT',
          danger: true,
        })
      ) {
        void game.goto('title', undefined, { transition: 'fade' });
      }
      break;
  }
}
</script>

<template>
  <div class="pause">
    <div ref="backdrop" class="pause__backdrop"><div class="pause__stripes" /></div>
    <h1 class="pause__title">PAUSE</h1>
    <MenuList class="pause__menu" :items="items" @select="select" />
    <div ref="panel" class="pause__panel">
      <Skew color="#111" shadow="#fff" class="pause__money"> ¥ <Counter :value="money" /> </Skew>
      <Skew color="#fff" class="pause__date">11/04 <small>DAYTIME</small></Skew>
    </div>
    <div class="pause__prompts">
      <InputPrompt action="confirm" label="SELECT" :size="44" />
      <InputPrompt action="back" label="BACK" :size="44" />
    </div>
  </div>
</template>

<style scoped>
.pause {
  position: absolute;
  inset: 0;
}
.pause__backdrop {
  position: absolute;
  inset: calc(-10% - var(--bl-bleed-y, 0px)) 38% calc(-10% - var(--bl-bleed-y, 0px))
    calc(-20% - var(--bl-bleed-x, 0px));
  background: var(--bl-color-primary);
  transform: skewX(-14deg);
  overflow: hidden;
}
.pause__stripes {
  position: absolute;
  inset: 0;
  background: repeating-linear-gradient(-60deg, transparent 0 60px, rgba(0, 0, 0, 0.12) 60px 120px);
}
.pause__title {
  position: absolute;
  left: 120px;
  top: 40px;
  margin: 0;
  font: 400 150px/1 var(--bl-font-display);
  color: #111;
  transform: rotate(-8deg);
  -webkit-text-stroke: 6px #fff;
  paint-order: stroke fill;
}
.pause__menu {
  position: absolute;
  left: 160px;
  top: 270px;
  font-size: 84px;
  gap: 4px;
}
.pause__panel {
  position: absolute;
  right: 140px;
  top: 180px;
  display: flex;
  flex-direction: column;
  align-items: flex-end;
  gap: 24px;
  font: 64px var(--bl-font-display);
}
.pause__date {
  color: #111;
}
.pause__date small {
  font-size: 0.5em;
}
.pause__prompts {
  position: absolute;
  right: 120px;
  bottom: 70px;
  display: flex;
  gap: 48px;
  font: 32px var(--bl-font-display);
  color: #fff;
}
</style>
