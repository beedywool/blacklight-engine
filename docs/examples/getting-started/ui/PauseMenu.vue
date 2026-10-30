<script setup lang="ts">
import { MenuList, useGame, useScreen } from '@blacklight/ui';

const game = useGame();
const screen = useScreen({ enter: 'slash', leave: 'fade' });
const items = [
  { label: 'RESUME', value: 'resume' },
  { label: 'TITLE', value: 'title' },
];

function select(value: string) {
  screen.close();
  if (value === 'title') void game.goto('title', undefined, { transition: 'iris' });
}
</script>

<template>
  <div class="pause">
    <h2>PAUSE</h2>
    <MenuList :items="items" @select="select" />
  </div>
</template>

<style scoped>
.pause {
  position: absolute;
  inset: 0 50% 0 0;
  display: grid;
  align-content: center;
  gap: 32px;
  padding-left: 160px;
  background: var(--bl-color-primary);
  color: #111111;
}
h2 {
  margin: 0;
  font: 400 140px/1 var(--bl-font-display);
}
.pause :deep(.bl-menu) {
  font-size: 64px;
}
</style>
