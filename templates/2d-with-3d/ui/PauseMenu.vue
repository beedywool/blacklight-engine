<script setup lang="ts">
import { MenuList, onUiStep, useGame, useScreen } from '@blacklight/ui';
import { ModelView } from '@blacklight/three/ui';
import { onBeforeUnmount, onMounted } from 'vue';

// The game stops while the menu is open; the model keeps turning (the preview runs in real time).
const game = useGame();
const screen = useScreen({ enter: 'fade', leave: 'fade' });
const items = [
  { label: 'Resume', value: 'resume' },
  { label: 'Title', value: 'title' },
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
  if (value === 'resume') screen.close();
  else void game.goto('title', undefined, { transition: 'fade' });
}
</script>

<template>
  <div class="menu">
    <div class="menu__panel">
      <h1 class="menu__title">Paused</h1>
      <MenuList :items="items" @select="select" />
    </div>
    <div class="menu__portrait">
      <ModelView model="hero" animation="idle" :width="360" :height="480" :spin="45" />
    </div>
  </div>
</template>

<style scoped>
.menu {
  position: absolute;
  inset: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 80px;
  background: rgba(8, 8, 8, 0.82);
}
.menu__panel {
  min-width: 360px;
  font-size: 40px;
  color: #fff;
}
.menu__title {
  margin: 0 0 24px;
  font-size: 64px;
}
.menu__portrait {
  border-radius: 28px;
  background: #1e1e1e;
  overflow: hidden;
}
</style>
