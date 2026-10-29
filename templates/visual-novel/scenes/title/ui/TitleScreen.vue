<script setup lang="ts">
import {
  InputPrompt,
  MenuList,
  PixiRender,
  SaveLoadScreen,
  SettingsScreen,
  WorldAnchor,
  playCutscene,
  t,
  useFx,
  useGame,
  useI18n,
  useUi,
} from '@blacklight/ui';
import type { GameObject } from '@blacklight/core';
import { computed, onMounted, shallowRef } from 'vue';
import NameEntry from '@ui/NameEntry.vue';
import { slotsFor } from '@ui/state';

defineProps<{ lantern: GameObject }>();
const game = useGame();
const ui = useUi();
const i18n = useI18n();
const slots = slotsFor(game);
const hasSaves = shallowRef(false);
onMounted(async () => (hasSaves.value = (await slots.list()).length > 0));

// The game canvas behind the menu gets comic-print dots (FX layer, synchronized with this screen).
useFx('halftone', { strength: 0.45, fade: 400 });

const items = computed(() => [
  { label: t('title.new'), value: 'new' },
  { label: t('title.continue'), value: 'continue', disabled: !hasSaves.value },
  { label: t('title.gallery'), value: 'gallery' },
  { label: t('title.settings'), value: 'settings' },
]);

async function select(value: string) {
  switch (value) {
    case 'new': {
      const player = await ui.modal<string>(NameEntry);
      if (player === undefined) return;
      await playCutscene(ui, 'intro', { subtitles: t('subtitles.file') });
      void game.goto('story', { player }, { transition: 'iris' });
      break;
    }
    case 'continue':
      ui.push(SaveLoadScreen, { mode: 'load', slots });
      break;
    case 'gallery':
      void game.goto('gallery', undefined, { transition: 'slices' });
      break;
    case 'settings':
      ui.push(SettingsScreen);
      break;
  }
}
</script>

<template>
  <div class="title">
    <div class="title__band" />
    <PixiRender class="title__logo" :fx="['glitch']" :strength="0.3">
      <h1 class="title__name">{{ t('title.name') }}</h1>
      <p class="title__subtitle">{{ t('title.subtitle') }}</p>
    </PixiRender>
    <MenuList :key="i18n.locale.value" class="title__menu" :items="items" @select="select" />
    <WorldAnchor :target="lantern" :offset="{ x: 0, y: -150 }" :margin="40">
      <span class="title__tag">{{ t('title.lanternHint') }}</span>
    </WorldAnchor>
    <div class="title__prompts">
      <InputPrompt action="confirm" :label="t('bl.common.select')" :size="44" />
    </div>
  </div>
</template>

<style scoped>
.title {
  position: absolute;
  inset: 0;
}
.title__band {
  position: absolute;
  inset: -20% 52% -20% -14%;
  background: var(--bl-color-primary);
  transform: skewX(-16deg);
  mix-blend-mode: multiply;
  opacity: 0.9;
}
.title__logo {
  position: absolute;
  left: 120px;
  top: 110px;
  padding: 10px 30px;
}
.title__name {
  margin: 0;
  font: 400 170px/1 var(--bl-font-display);
  color: #fff;
  -webkit-text-stroke: 8px #111;
  paint-order: stroke fill;
  transform: rotate(-5deg);
}
.title__subtitle {
  margin: 10px 0 0 12px;
  font: 32px var(--bl-font-body);
  color: #fff;
}
.title__menu {
  position: absolute;
  inset-inline-start: 160px;
  top: 500px;
  font-size: 68px;
}
.title__tag {
  display: inline-block;
  padding: 6px 18px;
  background: #111;
  color: #fff;
  font: 26px var(--bl-font-display);
  transform: skewX(var(--bl-skew));
}
.title__prompts {
  position: absolute;
  inset-inline-end: 120px;
  bottom: 70px;
  font: 32px var(--bl-font-display);
  color: #fff;
}
</style>
