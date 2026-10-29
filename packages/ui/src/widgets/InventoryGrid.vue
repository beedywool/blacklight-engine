<script setup lang="ts" generic="T">
import { computed } from 'vue';
import { useFocus } from '../composables';

const props = withDefaults(
  defineProps<{ items: (T | null)[]; columns: number; cellSize?: number; wrap?: boolean }>(),
  {
    cellSize: 96,
    wrap: false,
  },
);
const emit = defineEmits<{ select: [item: T | null, index: number] }>();
const { focused, group, item } = useFocus(props.items, { wrap: props.wrap });
const style = computed(() => ({
  gridTemplateColumns: `repeat(${props.columns}, ${props.cellSize}px)`,
  gridAutoRows: `${props.cellSize}px`,
}));
</script>

<template>
  <div class="bl-grid" v-bind="group" :style="style" role="grid">
    <div
      v-for="(cell, i) in items"
      :key="i"
      v-bind="item(i)"
      class="bl-grid__cell"
      :class="{ 'bl-grid__cell--focused': focused === i, 'bl-grid__cell--empty': cell === null }"
      role="gridcell"
      @click="emit('select', cell, i)"
    >
      <slot :item="cell" :index="i" />
    </div>
  </div>
</template>
