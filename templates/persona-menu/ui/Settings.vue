<script setup lang="ts">
import {
  InputPrompt,
  Select,
  Slider,
  Tabs,
  TextInput,
  Toggle,
  toast,
  useGame,
  useScreen,
  useUiRuntime,
  vFocus,
} from '@blacklight/ui';
import type { ActionName } from '@blacklight/core';
import { ref, watch } from 'vue';

useScreen({ enter: 'slide-left', leave: 'slide-right' });
const game = useGame();
const runtime = useUiRuntime();
const tab = ref(0);

const music = ref(game.audio.volume('music'));
const sfx = ref(game.audio.volume('sfx'));
watch(music, (v) => game.audio.volume('music', v));
watch(sfx, (v) => game.audio.volume('sfx', v));

const theme = ref(runtime.theme);
watch(theme, (v) => (runtime.theme = v));
const scale = ref(runtime.scale.value);
watch(scale, (v) => runtime.setScale(v));
const subtitles = ref(game.settings.get<boolean>('subtitles') ?? true);
watch(subtitles, (v) => game.settings.set('subtitles', v));
const name = ref(game.settings.get<string>('name') ?? 'Joker');
watch(name, (v) => game.settings.set('name', v));

const actions: ActionName[] = ['confirm', 'back', 'pause', 'jump', 'action'];
const capturing = ref<string | null>(null);
async function rebind(action: ActionName) {
  capturing.value = action;
  const binding = await game.input.captureBinding();
  capturing.value = null;
  if (!binding) return;
  game.input.rebind(action, [
    binding,
    ...game.input.bindingsOf(action).filter((b) => b !== binding),
  ]);
  toast(`${action.toUpperCase()} → ${binding}`);
}
</script>

<template>
  <div class="settings">
    <h1 class="settings__title">CONFIG</h1>
    <Tabs v-model="tab" class="settings__tabs" :tabs="['AUDIO', 'DISPLAY', 'CONTROLS']" prompts />
    <div class="settings__body">
      <template v-if="tab === 0">
        <Slider v-model="music" label="MUSIC" :step="0.1" />
        <Slider v-model="sfx" label="SOUND EFFECTS" :step="0.1" />
        <Toggle v-model="subtitles" label="SUBTITLES" />
      </template>
      <template v-else-if="tab === 1">
        <Select
          v-model="theme"
          label="THEME"
          :options="[
            { label: 'PERSONA', value: 'persona' },
            { label: 'BLACKLIGHT', value: 'blacklight' },
          ]"
        />
        <Slider v-model="scale" label="UI SCALE" :min="0.75" :max="1.5" :step="0.05">
          <template #default="{ value }">{{ Math.round(value * 100) }}%</template>
        </Slider>
        <TextInput v-model="name" label="NAME" />
      </template>
      <template v-else>
        <div
          v-for="action in actions"
          :key="action"
          v-focus
          class="settings__bind"
          @click="rebind(action)"
        >
          <span>{{ action.toUpperCase() }}</span>
          <span v-if="capturing === action">PRESS A BUTTON…</span>
          <InputPrompt v-else :action="action" :size="44" />
        </div>
      </template>
    </div>
    <div class="settings__prompts"><InputPrompt action="back" label="BACK" :size="44" /></div>
  </div>
</template>

<style scoped>
.settings {
  position: absolute;
  inset: 0;
  background: #111;
}
.settings__title {
  margin: 60px 120px 20px;
  font: 400 120px/1 var(--bl-font-display);
  color: var(--bl-color-primary);
  transform: rotate(-4deg);
}
.settings__tabs {
  margin-left: 160px;
}
.settings__body {
  margin: 40px 160px;
  width: 1100px;
  display: grid;
  gap: 16px;
}
.settings__bind {
  display: flex;
  justify-content: space-between;
  align-items: center;
  font-size: 30px;
  padding: 10px 20px;
  transform: skewX(var(--bl-skew));
}
.settings__bind[data-bl-focused] {
  background: var(--bl-color-focus);
  color: var(--bl-color-accent);
}
.settings__prompts {
  position: absolute;
  right: 120px;
  bottom: 70px;
  font: 32px var(--bl-font-display);
}
</style>
