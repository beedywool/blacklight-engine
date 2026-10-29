<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref } from 'vue';
import InputPrompt from '../components/InputPrompt.vue';

const props = defineProps<{ tabs: string[]; modelValue: number; prompts?: boolean }>();
const emit = defineEmits<{ 'update:modelValue': [index: number] }>();
const element = ref<HTMLElement | null>(null);

// `tabLeft` / `tabRight` (LB / RB, Q / E) switch tabs wherever the focus is.
const onTab = (event: Event) => {
  const step = (event as CustomEvent<number>).detail;
  const next = (props.modelValue + step + props.tabs.length) % props.tabs.length;
  emit('update:modelValue', next);
};
onMounted(() => element.value?.addEventListener('bl-tab', onTab));
onBeforeUnmount(() => element.value?.removeEventListener('bl-tab', onTab));
</script>

<template>
  <div ref="element" class="bl-tabs" data-bl-tabs role="tablist">
    <InputPrompt v-if="prompts" action="tabLeft" :size="36" />
    <button
      v-for="(tab, i) in tabs"
      :key="tab"
      class="bl-tabs__tab"
      :class="{ 'bl-tabs__tab--active': i === modelValue }"
      role="tab"
      :aria-selected="i === modelValue"
      type="button"
      @click="emit('update:modelValue', i)"
    >
      {{ tab }}
    </button>
    <InputPrompt v-if="prompts" action="tabRight" :size="36" />
  </div>
</template>
