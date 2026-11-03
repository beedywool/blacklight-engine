<script setup lang="ts">
import { computed } from 'vue';
import { accessibility, prefersReducedMotion } from '../a11y';
import { isCjk } from '../i18n';
import type { UiRuntime } from '../runtime';
import { activeTheme, resolveTheme, themeVariables } from '../theme';
import FloatingTextHost from './FloatingTextHost.vue';
import ScreenView from './ScreenView.vue';
import SubtitleHost from './SubtitleHost.vue';
import ToastHost from '../widgets/ToastHost.vue';

const props = defineProps<{ runtime: UiRuntime }>();
const frame = props.runtime.frame;
const i18n = props.runtime.i18n;

// The layer covers the design area in virtual pixels, scaled like the canvas.
const style = computed(() => ({
  ...themeVariables(resolveTheme(activeTheme.value)),
  '--bl-ui-scale': String(props.runtime.scale.value),
  '--bl-text-scale': String(accessibility.textScale),
  // What `extend` shows past the design area: full-screen bands add it to their insets.
  '--bl-bleed-x': `${frame.bleedX}px`,
  '--bl-bleed-y': `${frame.bleedY}px`,
  width: `${frame.width}px`,
  height: `${frame.height}px`,
  transform: `translate(${frame.x}px, ${frame.y}px) scale(${frame.scale})`,
}));
const lang = computed(() => i18n.locale.value);
const dir = computed(() => (void i18n.locale.value, i18n.dir));
</script>

<template>
  <div
    class="bl-ui"
    :class="{ 'bl-ui--cjk': isCjk(lang) }"
    :data-theme="activeTheme"
    :data-contrast="accessibility.contrast"
    :data-reduced-motion="prefersReducedMotion() || undefined"
    :lang="lang"
    :dir="dir"
    :style="style"
  >
    <FloatingTextHost :game="runtime.game" />
    <ScreenView
      v-for="entry in runtime.ordered"
      :key="entry.id"
      :entry="entry"
      :runtime="runtime"
    />
    <SubtitleHost />
    <ToastHost />
  </div>
</template>
