<script setup lang="ts">
import { RadialMenu, toast, useScreen } from '@blacklight/ui';

const screen = useScreen({ enter: 'zoom', leave: 'fade' });
const orders = ['ATTACK', 'GUARD', 'HEAL', 'FREE', 'CONSERVE', 'DIRECT'].map((label) => ({
  label,
  value: label,
}));
function choose(order: string) {
  toast(`Tactics: ${order}`);
  screen.close(order);
}
</script>

<template>
  <div class="tactics">
    <RadialMenu :items="orders" :radius="220" @select="choose" />
    <p class="tactics__hint">Choose with the stick, confirm with A</p>
  </div>
</template>

<style scoped>
.tactics {
  position: absolute;
  inset: 0;
  display: grid;
  place-items: center;
  font: 30px var(--bl-font-display);
}
.tactics__hint {
  position: absolute;
  bottom: 120px;
}
</style>
