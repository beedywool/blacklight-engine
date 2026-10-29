<script setup lang="ts">
import { animate } from 'motion';
import { onBeforeUnmount, ref, watch } from 'vue';

const props = withDefaults(
  defineProps<{
    value: number;
    max?: number;
    /** Delay (ms) before the trail catches up: shows how much was just lost. */
    trailDelay?: number;
    color?: string;
    trailColor?: string;
    /** Skewed bar ends. */
    skewed?: boolean;
  }>(),
  { max: 100, trailDelay: 450, skewed: true },
);

const ratio = (v: number) => Math.min(1, Math.max(0, v / props.max));
const fill = ref(ratio(props.value));
const trail = ref(fill.value);
let stops: (() => void)[] = [];

watch(
  () => [props.value, props.max],
  () => {
    stops.forEach((stop) => stop());
    const target = ratio(props.value);
    const gaining = target > fill.value;
    const a = animate(fill.value, target, {
      duration: 0.25,
      ease: 'easeOut',
      onUpdate: (v) => (fill.value = v),
    });
    // Losses: the trail waits, then drains. Gains: the trail jumps first.
    const b = animate(trail.value, target, {
      duration: gaining ? 0.05 : 0.5,
      delay: gaining ? 0 : props.trailDelay / 1000,
      ease: 'easeInOut',
      onUpdate: (v) => (trail.value = v),
    });
    stops = [() => a.stop(), () => b.stop()];
  },
);
onBeforeUnmount(() => stops.forEach((stop) => stop()));
</script>

<template>
  <div
    class="bl-gauge"
    :class="{ 'bl-gauge--skewed': skewed }"
    role="meter"
    :aria-valuenow="value"
    :aria-valuemax="max"
  >
    <div class="bl-gauge__trail" :style="{ width: `${trail * 100}%`, background: trailColor }" />
    <div class="bl-gauge__fill" :style="{ width: `${fill * 100}%`, background: color }" />
    <span class="bl-gauge__label"><slot /></span>
  </div>
</template>
