<script setup lang="ts">
import { computed } from 'vue';
import type { UiRuntime } from '../runtime';
import { activeTheme, resolveTheme, themeVariables } from '../theme';
import ScreenView from './ScreenView.vue';
import ToastHost from '../widgets/ToastHost.vue';

const props = defineProps<{ runtime: UiRuntime }>();
const frame = props.runtime.frame;

// The layer covers the design area in virtual pixels, scaled like the canvas.
const style = computed(() => ({
  ...themeVariables(resolveTheme(activeTheme.value)),
  '--bl-ui-scale': String(props.runtime.scale.value),
  width: `${frame.width}px`,
  height: `${frame.height}px`,
  transform: `translate(${frame.x}px, ${frame.y}px) scale(${frame.scale})`,
}));
</script>

<template>
  <div class="bl-ui" :data-theme="activeTheme" :style="style">
    <ScreenView
      v-for="entry in runtime.ordered"
      :key="entry.id"
      :entry="entry"
      :runtime="runtime"
    />
    <ToastHost />
  </div>
</template>
