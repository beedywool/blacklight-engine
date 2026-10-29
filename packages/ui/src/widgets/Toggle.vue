<script setup lang="ts">
import { vFocus } from '../directives';

const props = defineProps<{ modelValue: boolean; label?: string; on?: string; off?: string }>();
const emit = defineEmits<{ 'update:modelValue': [value: boolean] }>();

function onNavigate(event: Event) {
  const { direction } = (event as CustomEvent<{ direction: string }>).detail;
  if (direction === 'left' || direction === 'right') {
    event.preventDefault();
    emit('update:modelValue', direction === 'right');
  }
}
</script>

<template>
  <div
    v-focus
    class="bl-toggle"
    role="switch"
    :aria-checked="modelValue"
    @click="emit('update:modelValue', !props.modelValue)"
    @bl-navigate="onNavigate"
  >
    <span v-if="label" class="bl-toggle__label">{{ label }}</span>
    <span class="bl-toggle__state" :class="{ 'bl-toggle__state--on': modelValue }">{{
      modelValue ? (on ?? 'ON') : (off ?? 'OFF')
    }}</span>
  </div>
</template>
