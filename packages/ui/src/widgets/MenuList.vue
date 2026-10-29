<script setup lang="ts" generic="T">
import { useFocus } from '../composables';

export interface MenuItem<V> {
  label: string;
  value: V;
  disabled?: boolean;
  /** Second line or right-hand detail. */
  hint?: string;
}

const props = withDefaults(
  defineProps<{ items: MenuItem<T>[]; wrap?: boolean; horizontal?: boolean; skewed?: boolean }>(),
  {
    wrap: true,
    horizontal: false,
    skewed: true,
  },
);
const emit = defineEmits<{ select: [value: T, index: number]; focus: [value: T, index: number] }>();
const { focused, group, item } = useFocus(props.items, {
  wrap: props.wrap,
  axis: props.horizontal ? 'x' : 'y',
});
</script>

<template>
  <ul
    class="bl-menu"
    :class="{ 'bl-menu--horizontal': horizontal, 'bl-menu--skewed': skewed }"
    v-bind="group"
    role="menu"
  >
    <li
      v-for="(entry, i) in items"
      :key="i"
      v-bind="item(i)"
      class="bl-menu__item"
      :class="{ 'bl-menu__item--focused': focused === i }"
      :aria-disabled="entry.disabled || undefined"
      role="menuitem"
      @click="!entry.disabled && emit('select', entry.value, i)"
      @focus="emit('focus', entry.value, i)"
    >
      <span class="bl-menu__row">
        <span class="bl-menu__label">{{ entry.label }}</span>
        <span v-if="entry.hint" class="bl-menu__hint">{{ entry.hint }}</span>
      </span>
    </li>
  </ul>
</template>
