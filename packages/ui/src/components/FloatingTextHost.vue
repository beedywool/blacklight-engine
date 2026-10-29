<script setup lang="ts">
import { onBeforeUnmount, onMounted, shallowRef } from 'vue';
import type { Game } from '@blacklight/core';
import { prefersReducedMotion } from '../a11y';
import { onAfterDraw } from '../frame';
import { floatingTexts, worldToUi, type FloatingText } from '../world';

const props = defineProps<{ game: Game }>();
const now = shallowRef(performance.now());
const born = new WeakMap<FloatingText, number>();

function style(item: FloatingText) {
  void now.value;
  let start = born.get(item);
  if (start === undefined) born.set(item, (start = performance.now()));
  const t = Math.min(1, (performance.now() - start) / item.duration);
  const at = worldToUi(props.game, item.target, { offset: { x: item.x, y: item.y } });
  const rise = prefersReducedMotion() ? 0 : item.rise * (1 - (1 - t) * (1 - t));
  return {
    color: item.color,
    fontSize: `calc(${item.size}px * var(--bl-text-scale, 1))`,
    transform: `translate(${at.x}px, ${at.y - rise}px) translate(-50%, -50%) scale(${t < 0.12 ? 0.6 + (t / 0.12) * 0.5 : 1.1 - Math.min(0.1, (t - 0.12) * 0.4)})`,
    opacity: String(t < 0.7 ? 1 : 1 - (t - 0.7) / 0.3),
    visibility: at.onScreen ? undefined : ('hidden' as const),
  };
}

let off: (() => void) | undefined;
onMounted(() => {
  off = onAfterDraw(props.game, () => {
    if (floatingTexts.length > 0) now.value = performance.now();
  });
});
onBeforeUnmount(() => off?.());
</script>

<template>
  <div class="bl-floats" aria-hidden="true">
    <span
      v-for="item in floatingTexts"
      :key="item.id"
      class="bl-float"
      :class="item.className"
      :style="style(item)"
      >{{ item.text }}</span
    >
  </div>
</template>
