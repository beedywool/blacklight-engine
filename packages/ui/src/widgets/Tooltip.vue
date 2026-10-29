<script setup lang="ts">
import { computed, ref } from 'vue';
import { useUiRuntime } from '../composables';

withDefaults(defineProps<{ text: string; side?: 'top' | 'bottom' | 'left' | 'right' }>(), {
  side: 'top',
});
const runtime = useUiRuntime();
const wrapper = ref<HTMLElement | null>(null);
// Shown while anything inside is focused (gamepad) or hovered (mouse).
const hovered = ref(false);
const shown = computed(() => {
  const focused = runtime.focus.current.value;
  const element = wrapper.value;
  // Inside the focused element (a grid cell) or containing it (a button).
  return (
    hovered.value ||
    (!!element && !!focused && (element.contains(focused) || focused.contains(element)))
  );
});
</script>

<template>
  <span
    ref="wrapper"
    class="bl-tooltip-anchor"
    @pointerenter="hovered = true"
    @pointerleave="hovered = false"
  >
    <slot />
    <span v-if="shown" class="bl-tooltip" :class="`bl-tooltip--${side}`" role="tooltip">{{
      text
    }}</span>
  </span>
</template>
