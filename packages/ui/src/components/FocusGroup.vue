<script setup lang="ts">
import { computed } from 'vue';
import { GROUP_ATTR } from '../focus';

const props = defineProps<{
  /** Moving past the last element goes back to the first. */
  wrap?: boolean;
  /** Focus cannot leave the group with directions. */
  trap?: boolean;
  /** Only this axis moves inside the group; the other leaves it. */
  axis?: 'x' | 'y';
}>();
const attrs = computed(() => ({
  [GROUP_ATTR]: [props.wrap && 'wrap', props.trap && 'trap', props.axis].filter(Boolean).join(' '),
}));
</script>

<template>
  <div v-bind="attrs"><slot /></div>
</template>
