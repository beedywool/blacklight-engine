<script setup lang="ts">
import { computed } from 'vue';

export type MaskShape =
  'wipe-right' | 'wipe-left' | 'wipe-down' | 'wipe-up' | 'diagonal' | 'circle' | 'slash';

const props = withDefaults(
  defineProps<{
    /** How the content is revealed. */
    shape?: MaskShape;
    /** 0 hidden → 1 fully shown. Animate it (tween, timeline, CSS transition). */
    progress?: number;
    /** Transition duration in ms when `progress` changes; 0 to drive it yourself. */
    duration?: number;
  }>(),
  { shape: 'wipe-right', progress: 1, duration: 0 },
);

const style = computed(() => {
  const p = Math.min(1, Math.max(0, props.progress)) * 100;
  const clip: Record<string, string> = {
    'wipe-right': `inset(0 ${100 - p}% 0 0)`,
    'wipe-left': `inset(0 0 0 ${100 - p}%)`,
    'wipe-down': `inset(0 0 ${100 - p}% 0)`,
    'wipe-up': `inset(${100 - p}% 0 0 0)`,
    circle: `circle(${p * 0.75}% at 50% 50%)`,
    diagonal: `polygon(0 0, ${p * 2}% 0, 0 ${p * 2}%)`,
    slash: `polygon(0 0, ${p * 1.25}% 0, ${p * 1.25 - 25}% 100%, 0 100%)`,
  };
  return {
    clipPath: clip[props.shape],
    transition: props.duration
      ? `clip-path ${props.duration}ms cubic-bezier(0.2, 0, 0, 1)`
      : undefined,
  };
});
</script>

<template>
  <div class="bl-mask" :style="style"><slot /></div>
</template>
