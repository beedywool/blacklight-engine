<script setup lang="ts" generic="V">
import { computed, ref } from 'vue';
import { onUiStep, useGame } from '../composables';
import { FOCUS_ATTR } from '../focus';

const props = withDefaults(
  defineProps<{
    items: { label: string; value: V; icon?: string }[];
    radius?: number;
    player?: number;
  }>(),
  { radius: 180, player: 1 },
);
const emit = defineEmits<{ select: [value: V, index: number] }>();
const game = useGame();
const selected = ref(-1);

const positions = computed(() =>
  props.items.map((_, i) => {
    const angle = (i / props.items.length) * Math.PI * 2 - Math.PI / 2;
    return { x: Math.cos(angle) * props.radius, y: Math.sin(angle) * props.radius, angle };
  }),
);

// Stick or D-pad direction picks the closest item; the pointer works by angle too.
function pick(x: number, y: number) {
  if (Math.hypot(x, y) < 0.35) return;
  const angle = Math.atan2(y, x);
  let best = 0;
  let bestDelta = Infinity;
  positions.value.forEach((p, i) => {
    const delta = Math.abs(Math.atan2(Math.sin(angle - p.angle), Math.cos(angle - p.angle)));
    if (delta < bestDelta) [best, bestDelta] = [i, delta];
  });
  selected.value = best;
}
onUiStep(
  () => {
    const input = game.input.uiPlayer(props.player);
    pick(input.axis('left', 'right'), input.axis('up', 'down'));
  },
  { onlyOnTop: true },
);

function onNavigate(event: Event) {
  event.preventDefault();
}
function onPointer(event: PointerEvent) {
  const box = (event.currentTarget as HTMLElement).getBoundingClientRect();
  pick(event.clientX - (box.left + box.width / 2), event.clientY - (box.top + box.height / 2));
}
const focusAttr = { [FOCUS_ATTR]: '', 'data-bl-autofocus': '' };
</script>

<template>
  <div
    class="bl-radial"
    v-bind="focusAttr"
    :style="{ width: `${radius * 2 + 160}px`, height: `${radius * 2 + 160}px` }"
    @bl-navigate="onNavigate"
    @pointermove="onPointer"
    @click="selected >= 0 && emit('select', items[selected]!.value, selected)"
  >
    <div
      v-for="(item, i) in items"
      :key="i"
      class="bl-radial__item"
      :class="{ 'bl-radial__item--selected': selected === i }"
      :style="{
        transform: `translate(${positions[i]!.x}px, ${positions[i]!.y}px) translate(-50%, -50%)`,
      }"
    >
      <img v-if="item.icon" :src="item.icon" alt="" />
      <span>{{ item.label }}</span>
    </div>
  </div>
</template>
