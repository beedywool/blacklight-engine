<script setup lang="ts">
import { computed } from 'vue';
import { vFocus } from '../directives';

const props = withDefaults(
  defineProps<{ modelValue: number; min?: number; max?: number; step?: number; label?: string }>(),
  {
    min: 0,
    max: 1,
    step: 0.1,
  },
);
const emit = defineEmits<{ 'update:modelValue': [value: number] }>();
const ratio = computed(() => (props.modelValue - props.min) / (props.max - props.min));
const set = (value: number) => {
  const snapped = Math.round((value - props.min) / props.step) * props.step + props.min;
  emit('update:modelValue', Math.min(props.max, Math.max(props.min, Number(snapped.toFixed(6)))));
};

// Left / right change the value instead of moving focus.
function onNavigate(event: Event) {
  const { direction } = (event as CustomEvent<{ direction: string }>).detail;
  if (direction === 'left' || direction === 'right') {
    event.preventDefault();
    set(props.modelValue + (direction === 'right' ? props.step : -props.step));
  }
}

function onPointer(event: PointerEvent) {
  if (event.type === 'pointermove' && event.buttons === 0) return;
  const track = (event.currentTarget as HTMLElement)
    .querySelector('.bl-slider__track')!
    .getBoundingClientRect();
  set(props.min + ((event.clientX - track.left) / track.width) * (props.max - props.min));
}
</script>

<template>
  <div
    v-focus
    class="bl-slider"
    role="slider"
    :aria-valuenow="modelValue"
    :aria-valuemin="min"
    :aria-valuemax="max"
    :aria-label="label"
    @bl-navigate="onNavigate"
    @pointerdown="onPointer"
    @pointermove="onPointer"
  >
    <span v-if="label" class="bl-slider__label">{{ label }}</span>
    <span class="bl-slider__track"
      ><span class="bl-slider__fill" :style="{ width: `${ratio * 100}%` }"
    /></span>
    <span class="bl-slider__value"
      ><slot :value="modelValue">{{ Math.round(ratio * 100) }}</slot></span
    >
  </div>
</template>
