<script setup lang="ts">
import { vFocus } from '../directives';

withDefaults(
  defineProps<{
    variant?: 'primary' | 'secondary' | 'danger';
    disabled?: boolean;
    autofocus?: boolean;
  }>(),
  {
    variant: 'primary',
  },
);
defineEmits<{ click: [MouseEvent] }>();
</script>

<template>
  <button
    v-focus
    class="bl-button"
    :class="`bl-button--${variant}`"
    :disabled="disabled"
    :data-bl-autofocus="autofocus || undefined"
    type="button"
    @click="$emit('click', $event)"
  >
    <slot />
  </button>
</template>
