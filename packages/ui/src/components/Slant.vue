<script setup lang="ts">
import { computed } from 'vue';

const props = withDefaults(
  defineProps<{
    /** Horizontal cut of the left edge, in px (positive leans right at the top). */
    left?: number;
    /** Horizontal cut of the right edge, in px. */
    right?: number;
    color?: string;
    /** Offset drop shadow color. */
    shadow?: string;
  }>(),
  { left: 0, right: 24 },
);

// The polygon is drawn on the element's box; edges move inwards by the cut amounts.
const style = computed(() => {
  const l = props.left;
  const r = props.right;
  const clip = `polygon(${Math.max(0, l)}px 0, calc(100% - ${Math.max(0, -r)}px) 0, calc(100% - ${Math.max(0, r)}px) 100%, ${Math.max(0, -l)}px 100%)`;
  return {
    clipPath: clip,
    ...(props.color ? { background: props.color } : {}),
  };
});
</script>

<template>
  <div
    class="bl-slant-wrap"
    :class="{ 'bl-skew--shadow': shadow }"
    :style="shadow ? { '--bl-shadow-color': shadow } : {}"
  >
    <div class="bl-slant" :style="style"><slot /></div>
  </div>
</template>
