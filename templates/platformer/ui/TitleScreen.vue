<script setup lang="ts">
import { InputPrompt, MenuList, SettingsScreen, useGame, useUi } from '@blacklight/ui';

const game = useGame();
const ui = useUi();
const items = [
  { label: 'START', value: 'start' },
  { label: 'SETTINGS', value: 'settings' },
];

function select(value: string) {
  if (value === 'start') void game.goto('level', undefined, { transition: 'fade' });
  else ui.push(SettingsScreen);
}
</script>

<template>
  <div class="title">
    <h1 class="title__name">PLATFORMER</h1>
    <p class="title__hint">Collect the coins, mind the slimes, reach the star.</p>
    <MenuList class="title__menu" :items="items" @select="select" />
    <div class="title__prompts">
      <InputPrompt action="confirm" label="SELECT" :size="36" />
    </div>
  </div>
</template>

<style scoped>
.title {
  position: absolute;
  inset: 0;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 24px;
  background: linear-gradient(#1b2a4a, #486892);
  color: #fff;
}
.title__name {
  margin: 0;
  font: 400 120px/1 var(--bl-font-display);
  letter-spacing: 4px;
  -webkit-text-stroke: 6px #15171e;
  paint-order: stroke fill;
  color: #ffd60a;
}
.title__hint {
  margin: 0 0 24px;
  font-size: 28px;
}
.title__menu {
  font-size: 56px;
}
.title__prompts {
  position: absolute;
  right: 60px;
  bottom: 40px;
  font-size: 28px;
}
</style>
