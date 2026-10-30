<script setup lang="ts">
import {
  InputPrompt,
  MenuList,
  SettingsScreen,
  onUiStep,
  useGame,
  useScreen,
  useUi,
} from '@blacklight/ui';
import { onBeforeUnmount, onMounted } from 'vue';
import type Hero from '@objects/hero/hero.object';
import { progress } from './progress';

// The level stops while the menu is open; Start or Back closes it.
const game = useGame();
const ui = useUi();
const screen = useScreen({ enter: 'slide-down', leave: 'fade' });
const items = [
  { label: 'RESUME', value: 'resume' },
  { label: 'RETRY', value: 'retry' },
  { label: 'SETTINGS', value: 'settings' },
  { label: 'TITLE', value: 'title' },
];

onMounted(() => game.pause());
onBeforeUnmount(() => game.resume());
onUiStep(
  () => {
    const input = game.input.uiPlayer(1);
    if (input.pressed('pause') && !input.pressed('back')) screen.close();
  },
  { onlyOnTop: true },
);

function select(value: string) {
  switch (value) {
    case 'resume':
      screen.close();
      break;
    case 'retry':
      // Back to the last checkpoint (or the start) without losing the coins.
      game.scene?.find<Hero>('Hero')?.hurt();
      screen.close();
      break;
    case 'settings':
      ui.push(SettingsScreen);
      break;
    case 'title':
      void game.goto('title', undefined, { transition: 'fade' });
      break;
  }
}
</script>

<template>
  <div class="pause">
    <div class="pause__panel">
      <h1 class="pause__title">PAUSED</h1>
      <p class="pause__coins">{{ progress.coins }} / {{ progress.total }} coins</p>
      <MenuList class="pause__menu" :items="items" @select="select" />
      <div class="pause__prompts">
        <InputPrompt action="confirm" label="SELECT" :size="32" />
        <InputPrompt action="back" label="BACK" :size="32" />
      </div>
    </div>
  </div>
</template>

<style scoped>
.pause {
  position: absolute;
  inset: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  background: rgba(8, 8, 8, 0.7);
}
.pause__panel {
  min-width: 420px;
  padding: 40px 56px;
  border-radius: 28px;
  background: #1e1e1e;
  color: #fff;
}
.pause__title {
  margin: 0;
  font: 400 72px/1 var(--bl-font-display);
  color: #ffd60a;
}
.pause__coins {
  margin: 8px 0 24px;
  font-size: 24px;
  opacity: 0.8;
}
.pause__menu {
  font-size: 44px;
}
.pause__prompts {
  display: flex;
  gap: 32px;
  margin-top: 32px;
  font-size: 22px;
}
</style>
