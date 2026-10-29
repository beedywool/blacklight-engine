<script setup lang="ts" generic="V">
import { computed } from 'vue';
import { vFocus } from '../directives';

const props = withDefaults(
  defineProps<{
    modelValue: V;
    options: { label: string; value: V }[];
    label?: string;
    wrap?: boolean;
  }>(),
  {
    wrap: true,
  },
);
const emit = defineEmits<{ 'update:modelValue': [value: V] }>();
const index = computed(() =>
  Math.max(
    0,
    props.options.findIndex((o) => o.value === props.modelValue),
  ),
);

function step(by: number) {
  const n = props.options.length;
  let next = index.value + by;
  next = props.wrap ? (next + n) % n : Math.min(n - 1, Math.max(0, next));
  emit('update:modelValue', props.options[next]!.value);
}

// Persona-style "‹ Option ›": left / right cycle, confirm moves forward.
function onNavigate(event: Event) {
  const { direction } = (event as CustomEvent<{ direction: string }>).detail;
  if (direction === 'left' || direction === 'right') {
    event.preventDefault();
    step(direction === 'right' ? 1 : -1);
  }
}
</script>

<template>
  <div
    v-focus
    class="bl-select"
    role="listbox"
    :aria-label="label"
    @bl-navigate="onNavigate"
    @click="step(1)"
  >
    <span v-if="label" class="bl-select__label">{{ label }}</span>
    <span class="bl-select__value">
      <span class="bl-select__arrow" aria-hidden="true" @click.stop="step(-1)">‹</span>
      {{ options[index]?.label }}
      <span class="bl-select__arrow" aria-hidden="true" @click.stop="step(1)">›</span>
    </span>
  </div>
</template>
