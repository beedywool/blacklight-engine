<script setup lang="ts">
import { computed } from 'vue';

const props = withDefaults(
  defineProps<{
    /** Image URL (import it: `import frame from './frame.png'`). */
    src: string;
    /** Slice insets in image pixels: one value or [top, right, bottom, left]. */
    slice: number | [number, number, number, number];
    /** Drawn border width in virtual pixels; defaults to the slice. */
    border?: number | [number, number, number, number];
    /** How edges fill: stretch, repeat, round or space. */
    repeat?: 'stretch' | 'repeat' | 'round' | 'space';
  }>(),
  { repeat: 'stretch' },
);

const list = (v: number | number[]) => (Array.isArray(v) ? v : [v, v, v, v]);
const style = computed(() => ({
  borderStyle: 'solid',
  borderWidth: list(props.border ?? props.slice)
    .map((n) => `${n}px`)
    .join(' '),
  borderImage: `url("${props.src}") ${list(props.slice).join(' ')} fill / ${list(
    props.border ?? props.slice,
  )
    .map((n) => `${n}px`)
    .join(' ')} ${props.repeat}`,
}));
</script>

<template>
  <div class="bl-nine-slice" :style="style"><slot /></div>
</template>
