<script setup lang="ts">
import { InputPrompt, MenuList, useGame } from '@blacklight/ui';
import { onBeforeUnmount, onMounted } from 'vue';
import { progress } from './progress';

// Shown when the hero reaches the goal: the score, then play again or go back to the title.
const game = useGame();
const items = [
  { label: 'PLAY AGAIN', value: 'again' },
  { label: 'TITLE', value: 'title' },
];

onMounted(() => game.pause());
onBeforeUnmount(() => game.resume());

function select(value: string) {
  void game.goto(value === 'again' ? 'level' : 'title', undefined, { transition: 'fade' });
}
</script>

<template>
  <div class="clear">
    <h1 class="clear__title">LEVEL CLEAR</h1>
    <p class="clear__score">
      {{ progress.coins }} / {{ progress.total }} coins · {{ progress.hits }} hits
    </p>
    <MenuList class="clear__menu" :items="items" @select="select" />
    <div class="clear__prompts"><InputPrompt action="confirm" label="SELECT" :size="32" /></div>
  </div>
</template>

<style scoped>
.clear {
  position: absolute;
  inset: 0;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 16px;
  background: rgba(8, 8, 8, 0.75);
  color: #fff;
}
.clear__title {
  margin: 0;
  font: 400 96px/1 var(--bl-font-display);
  color: #ffd60a;
  -webkit-text-stroke: 5px #15171e;
  paint-order: stroke fill;
}
.clear__score {
  margin: 0 0 24px;
  font-size: 32px;
}
.clear__menu {
  font-size: 48px;
}
.clear__prompts {
  font-size: 22px;
}
</style>
