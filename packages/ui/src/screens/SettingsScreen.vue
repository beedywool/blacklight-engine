<script setup lang="ts">
import { computed, ref, shallowRef, watch } from 'vue';
import type { ActionName, Bus } from '@blacklight/core';
import { accessibility, type ColorFilter } from '../a11y';
import { useGame, useScreen, useUiRuntime } from '../composables';
import { vFocus } from '../directives';
import { t, useI18n } from '../i18n';
import { themeNames } from '../theme';
import InputPrompt from '../components/InputPrompt.vue';
import Select from '../widgets/Select.vue';
import Slider from '../widgets/Slider.vue';
import Tabs from '../widgets/Tabs.vue';
import Toggle from '../widgets/Toggle.vue';

type Tab = 'audio' | 'video' | 'controls' | 'language' | 'accessibility';

/**
 * Ready-made settings screen (UI-17): audio buses, video (full screen, UI scale, theme), controls
 * with rebinding, language, and accessibility. Every change applies at once and is saved.
 */
const props = withDefaults(
  defineProps<{
    /** Tabs to show, in order. The language tab hides itself with fewer than two languages. */
    tabs?: Tab[];
    /** Actions listed on the controls tab. @defaultValue every action of the game */
    actions?: string[];
    /** Buses listed on the audio tab. */
    buses?: Exclude<Bus, never>[];
  }>(),
  {
    tabs: () => ['audio', 'video', 'controls', 'language', 'accessibility'],
    buses: () => ['master', 'music', 'sfx', 'voice', 'ui'],
  },
);
useScreen({ enter: 'slide-left', leave: 'slide-right' });
const game = useGame();
const runtime = useUiRuntime();
const i18n = useI18n();

const tabs = computed(() =>
  props.tabs.filter((tab) => tab !== 'language' || i18n.available.length > 1),
);
const tab = ref(0);
const current = computed(() => tabs.value[tab.value]);

// Audio
const volumes = ref<Record<string, number>>(
  Object.fromEntries(props.buses.map((bus) => [bus, game.audio.volume(bus)])),
);
watch(
  volumes,
  (value) => {
    for (const [bus, volume] of Object.entries(value)) game.audio.volume(bus as Bus, volume);
  },
  { deep: true },
);

// Video
const fullscreen = shallowRef(!!document.fullscreenElement);
watch(fullscreen, async (on) => {
  try {
    if (on && !document.fullscreenElement) await document.documentElement.requestFullscreen();
    if (!on && document.fullscreenElement) await document.exitFullscreen();
  } catch {
    fullscreen.value = !!document.fullscreenElement;
  }
});
const scale = ref(runtime.scale.value);
watch(scale, (value) => runtime.setScale(value));
const theme = ref(runtime.theme);
watch(theme, (value) => (runtime.theme = value));
const themes = themeNames().map((name) => ({ label: name.toUpperCase(), value: name }));

// Controls
const actions = computed(
  () =>
    (props.actions ??
      game.input.actions.filter(
        (a) => !['up', 'down', 'left', 'right', 'tabLeft', 'tabRight'].includes(a),
      )) as ActionName[],
);
const capturing = shallowRef<string | null>(null);
async function rebind(action: ActionName) {
  if (capturing.value) return;
  capturing.value = action;
  const binding = await game.input.captureBinding();
  capturing.value = null;
  if (!binding) return;
  game.input.rebind(action, [
    binding,
    ...game.input.bindingsOf(action).filter((b) => b !== binding),
  ]);
}

// Language
async function setLanguage(lang: string) {
  await i18n.setLocale(lang);
}

// Accessibility
const filters: ColorFilter[] = ['none', 'protanopia', 'deuteranopia', 'tritanopia', 'grayscale'];
const motionOptions = computed(() => [
  { label: t('bl.settings.system'), value: 'system' as const },
  { label: t('bl.common.on'), value: 'on' as const },
  { label: t('bl.common.off'), value: 'off' as const },
]);
const highContrast = computed({
  get: () => accessibility.contrast === 'high',
  set: (on: boolean) => (accessibility.contrast = on ? 'high' : 'normal'),
});
</script>

<template>
  <div class="bl-settings">
    <h1 class="bl-settings__title">{{ t('bl.settings.title') }}</h1>
    <Tabs
      v-model="tab"
      class="bl-settings__tabs"
      :tabs="tabs.map((name) => t(`bl.settings.${name}`))"
      prompts
    />
    <div :key="current" class="bl-settings__body" data-bl-focus-group="y">
      <template v-if="current === 'audio'">
        <Slider
          v-for="bus in buses"
          :key="bus"
          :model-value="volumes[bus] ?? 0"
          :label="t(`bl.settings.${bus}`)"
          :step="0.1"
          @update:model-value="(value: number) => (volumes[bus] = value)"
        />
      </template>

      <template v-else-if="current === 'video'">
        <Toggle
          v-model="fullscreen"
          :label="t('bl.settings.fullscreen')"
          :on="t('bl.common.on')"
          :off="t('bl.common.off')"
        />
        <Slider
          v-model="scale"
          :label="t('bl.settings.uiScale')"
          :min="0.75"
          :max="1.5"
          :step="0.05"
        >
          <template #default="{ value }">{{ Math.round(value * 100) }}%</template>
        </Slider>
        <Select
          v-if="themes.length > 1"
          v-model="theme"
          :label="t('bl.settings.theme')"
          :options="themes"
        />
      </template>

      <template v-else-if="current === 'controls'">
        <div
          v-for="action in actions"
          :key="action"
          v-focus
          class="bl-settings__bind"
          :data-action="action"
          @click="rebind(action)"
        >
          <span>{{ t(`actions.${action}`, {}, action.toUpperCase()) }}</span>
          <span v-if="capturing === action">{{ t('bl.settings.press') }}</span>
          <InputPrompt v-else :action="action" :size="44" />
        </div>
        <div v-focus class="bl-settings__bind" @click="game.input.resetBindings()">
          <span>{{ t('bl.settings.resetControls') }}</span>
        </div>
      </template>

      <template v-else-if="current === 'language'">
        <div
          v-for="lang in i18n.available"
          :key="lang"
          v-focus
          class="bl-settings__language"
          :class="{ 'bl-settings__language--active': i18n.locale.value === lang }"
          :lang="lang"
          :data-lang="lang"
          @click="setLanguage(lang)"
        >
          <span>{{ i18n.languageName(lang, true) }}</span>
          <small>{{ i18n.languageName(lang) }}</small>
        </div>
      </template>

      <template v-else-if="current === 'accessibility'">
        <Slider
          v-model="accessibility.textScale"
          :label="t('bl.settings.textSize')"
          :min="0.8"
          :max="2"
          :step="0.1"
        >
          <template #default="{ value }">{{ Math.round(value * 100) }}%</template>
        </Slider>
        <Slider
          v-model="accessibility.textSpeed"
          :label="t('bl.settings.textSpeed')"
          :min="0"
          :max="120"
          :step="15"
        >
          <template #default="{ value }">{{
            value === 0 ? t('bl.settings.instant') : value
          }}</template>
        </Slider>
        <Toggle
          v-model="highContrast"
          :label="t('bl.settings.contrast')"
          :on="t('bl.common.on')"
          :off="t('bl.common.off')"
        />
        <Select
          v-model="accessibility.colorFilter"
          :label="t('bl.settings.colorFilter')"
          :options="filters.map((value) => ({ value, label: t(`bl.settings.filters.${value}`) }))"
        />
        <Select
          v-model="accessibility.reducedMotion"
          :label="t('bl.settings.reducedMotion')"
          :options="motionOptions"
        />
        <Toggle
          v-model="accessibility.subtitles"
          :label="t('bl.settings.subtitles')"
          :on="t('bl.common.on')"
          :off="t('bl.common.off')"
        />
        <Slider
          v-model="accessibility.subtitleSize"
          :label="t('bl.settings.subtitleSize')"
          :min="0.75"
          :max="2"
          :step="0.25"
        >
          <template #default="{ value }">{{ Math.round(value * 100) }}%</template>
        </Slider>
        <Slider
          v-model="accessibility.subtitleBackground"
          :label="t('bl.settings.subtitleBackground')"
          :min="0"
          :max="1"
          :step="0.1"
        />
      </template>
    </div>
    <div class="bl-settings__prompts">
      <InputPrompt action="back" :label="t('bl.common.back')" :size="44" />
    </div>
  </div>
</template>
