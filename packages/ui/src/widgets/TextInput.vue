<script setup lang="ts">
import { ref } from 'vue';
import { useGame, useUi } from '../composables';
import { vFocus } from '../directives';
import VirtualKeyboard from './VirtualKeyboard.vue';

const props = withDefaults(
  defineProps<{ modelValue: string; label?: string; placeholder?: string; maxLength?: number }>(),
  {
    maxLength: 64,
  },
);
const emit = defineEmits<{ 'update:modelValue': [value: string]; submit: [value: string] }>();
const game = useGame();
const ui = useUi();
const input = ref<HTMLInputElement | null>(null);
const composing = ref(false);

// A gamepad cannot type: confirming the field opens the on-screen keyboard instead.
async function onClick(event: MouseEvent) {
  if (game.input.lastDevice !== 'gamepad') return;
  event.preventDefault();
  const value = await ui.modal<string>(VirtualKeyboard, {
    value: props.modelValue,
    maxLength: props.maxLength,
    title: props.label,
  });
  if (value !== undefined) {
    emit('update:modelValue', value);
    emit('submit', value);
  }
}

function onInput(event: Event) {
  // IME composition (Japanese, Chinese, Korean) commits on compositionend; partial text is not emitted.
  if (composing.value) return;
  emit('update:modelValue', (event.target as HTMLInputElement).value);
}
</script>

<template>
  <label class="bl-text-input">
    <span v-if="label" class="bl-text-input__label">{{ label }}</span>
    <input
      ref="input"
      v-focus
      class="bl-text-input__field"
      :value="modelValue"
      :placeholder="placeholder"
      :maxlength="maxLength"
      type="text"
      autocomplete="off"
      @input="onInput"
      @compositionstart="composing = true"
      @compositionend="((composing = false), onInput($event))"
      @keydown.enter="emit('submit', modelValue)"
      @click="onClick"
    />
  </label>
</template>
