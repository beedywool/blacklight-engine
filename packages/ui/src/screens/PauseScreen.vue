<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted } from 'vue';
import type { SceneName } from '@blacklight/core';
import { onUiStep, useGame, useScreen, useUi } from '../composables';
import { t } from '../i18n';
import type { SaveSlotMeta, SaveSlots } from '../slots';
import InputPrompt from '../components/InputPrompt.vue';
import MenuList from '../widgets/MenuList.vue';
import SaveLoadScreen from './SaveLoadScreen.vue';
import SettingsScreen from './SettingsScreen.vue';

type Item = 'resume' | 'settings' | 'save' | 'load' | 'title' | 'quit';

/**
 * Ready-made pause menu (UI-17): resume, settings, save, load, back to title, quit. Pauses the game
 * while open. Closes with `'resume'`, `'title'`, `'quit'` or `'loaded'`.
 */
const props = withDefaults(
  defineProps<{
    /** Entries, in order. `save` and `load` need `slots`; `quit` hides on the web. */
    items?: Item[];
    slots?: SaveSlots;
    /** Details stored with saves made from this menu. */
    meta?: () => SaveSlotMeta | Promise<SaveSlotMeta>;
    /** Scene of the title screen. @defaultValue the game's entry scene */
    titleScene?: string;
    /** Pause the game logic while the menu is open. */
    pauseGame?: boolean;
  }>(),
  { items: () => ['resume', 'settings', 'save', 'load', 'title', 'quit'], pauseGame: true },
);
const game = useGame();
const ui = useUi();
const screen = useScreen({ enter: 'slash', leave: 'fade' });

const entries = computed(() =>
  props.items
    .filter((item) => (item !== 'save' && item !== 'load') || props.slots)
    .filter((item) => item !== 'quit' || game.platform.name !== 'web')
    .map((value) => ({
      value,
      label: t(value === 'title' ? 'bl.pause.title_screen' : `bl.pause.${value}`),
    })),
);

let paused = false;
onMounted(() => {
  if (props.pauseGame && !game.paused) {
    paused = true;
    game.pause();
  }
});
onBeforeUnmount(() => {
  if (paused) game.resume();
});

// Pause closes the menu like back.
onUiStep(
  () => {
    const input = game.input.uiPlayer(1);
    if (input.pressed('pause') && !input.pressed('back')) screen.close('resume');
  },
  { onlyOnTop: true },
);

async function select(item: Item) {
  switch (item) {
    case 'resume':
      screen.close('resume');
      break;
    case 'settings':
      ui.push(SettingsScreen);
      break;
    case 'save':
    case 'load': {
      const result = await ui.push(SaveLoadScreen, { mode: item, slots: props.slots, meta: props.meta })
        .result;
      if (result === 'loaded') screen.close('loaded');
      break;
    }
    case 'title':
      if (await ui.confirm({ message: t('bl.pause.confirmTitle'), danger: true })) {
        screen.close('title');
        void game.goto((props.titleScene ?? game.config.entry) as SceneName, undefined, {
          transition: 'fade',
        });
      }
      break;
    case 'quit':
      if (await ui.confirm({ message: t('bl.pause.confirmQuit'), danger: true })) {
        screen.close('quit');
        game.platform.quit();
      }
      break;
  }
}
</script>

<template>
  <div class="bl-pause">
    <div class="bl-pause__band" />
    <h1 class="bl-pause__title">{{ t('bl.pause.title') }}</h1>
    <MenuList class="bl-pause__menu" :items="entries" @select="select" />
    <div class="bl-pause__prompts">
      <InputPrompt action="confirm" :label="t('bl.common.select')" :size="44" />
      <InputPrompt action="back" :label="t('bl.common.back')" :size="44" />
    </div>
  </div>
</template>
