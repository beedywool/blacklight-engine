<script setup lang="ts">
import { computed, ref } from 'vue';
import { useScreen } from '../composables';
import FocusGroup from '../components/FocusGroup.vue';
import { vFocus } from '../directives';

const props = withDefaults(defineProps<{ value?: string; maxLength?: number; title?: string }>(), {
  value: '',
  maxLength: 64,
});
const text = ref(props.value);
const shift = ref(false);
const screen = useScreen({
  enter: 'slide-up',
  leave: 'slide-down',
  onBack: () => {
    // Back deletes first, then closes on an empty field.
    if (text.value.length === 0) return false;
    text.value = text.value.slice(0, -1);
    return true;
  },
});
const rows = computed(() =>
  ['1234567890', 'qwertyuiop', 'asdfghjkl-', 'zxcvbnm,.?'].map((row) => [
    ...(shift.value ? row.toUpperCase() : row),
  ]),
);
const type = (key: string) => {
  if (text.value.length < props.maxLength) text.value += key;
};
</script>

<template>
  <div class="bl-keyboard" role="dialog" :aria-label="title ?? 'Keyboard'">
    <div class="bl-keyboard__title">{{ title }}</div>
    <div class="bl-keyboard__text">{{ text }}<span class="bl-keyboard__caret">|</span></div>
    <FocusGroup class="bl-keyboard__keys" wrap>
      <div v-for="(row, r) in rows" :key="r" class="bl-keyboard__row">
        <button
          v-for="(key, k) in row"
          :key="k"
          v-focus
          :data-bl-autofocus="(r === 0 && k === 0) || undefined"
          class="bl-keyboard__key"
          type="button"
          @click="type(key)"
        >
          {{ key }}
        </button>
      </div>
      <div class="bl-keyboard__row">
        <button
          v-focus
          class="bl-keyboard__key bl-keyboard__key--wide"
          type="button"
          @click="shift = !shift"
        >
          Shift
        </button>
        <button
          v-focus
          class="bl-keyboard__key bl-keyboard__key--space"
          type="button"
          @click="type(' ')"
        >
          Space
        </button>
        <button
          v-focus
          class="bl-keyboard__key bl-keyboard__key--wide"
          type="button"
          @click="text = text.slice(0, -1)"
        >
          Delete
        </button>
        <button
          v-focus
          class="bl-keyboard__key bl-keyboard__key--wide bl-keyboard__key--done"
          type="button"
          @click="screen.close(text)"
        >
          Done
        </button>
      </div>
    </FocusGroup>
  </div>
</template>
