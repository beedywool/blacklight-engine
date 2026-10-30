<script setup lang="ts">
import { InputPrompt, MenuList, useGame } from '@blacklight/ui';

const game = useGame();
const items = [
  { label: 'START', value: 'start' },
  { label: 'CREDITS', value: 'credits', disabled: true },
];

function select(value: string) {
  if (value === 'start') void game.goto('field', undefined, { transition: 'fade' });
}
</script>

<template>
  <div class="title">
    <h1>{{ game.config.name }}</h1>
    <MenuList :items="items" @select="select" />
    <InputPrompt class="title__prompt" action="confirm" label="SELECT" :size="44" />
  </div>
</template>

<style scoped>
.title {
  position: absolute;
  inset: 0;
  display: grid;
  align-content: center;
  justify-items: start;
  gap: 48px;
  padding-left: 200px;
  background: #080808;
}
h1 {
  margin: 0;
  font: 400 160px/1 var(--bl-font-display);
}
.title :deep(.bl-menu) {
  font-size: 72px;
}
.title__prompt {
  position: absolute;
  right: 120px;
  bottom: 80px;
  font: 32px var(--bl-font-display);
}
</style>
