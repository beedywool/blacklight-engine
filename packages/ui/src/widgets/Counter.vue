<script setup lang="ts">
import { animate } from 'motion';
import { onBeforeUnmount, ref, watch } from 'vue';

const props = withDefaults(
  defineProps<{ value: number; duration?: number; digits?: number; locale?: string }>(),
  {
    duration: 600,
    digits: 0,
  },
);
const shown = ref(props.value);
let stop: (() => void) | undefined;
watch(
  () => props.value,
  (to) => {
    stop?.();
    const controls = animate(shown.value, to, {
      duration: props.duration / 1000,
      ease: 'easeOut',
      onUpdate: (v) => (shown.value = v),
    });
    stop = () => controls.stop();
  },
);
onBeforeUnmount(() => stop?.());
const format = (v: number) =>
  v.toLocaleString(props.locale, {
    minimumFractionDigits: props.digits,
    maximumFractionDigits: props.digits,
  });
</script>

<template>
  <span class="bl-counter">{{ format(shown) }}</span>
</template>
