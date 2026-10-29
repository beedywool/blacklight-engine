<script setup lang="ts">
import {
  Backlog,
  DialogueBox,
  PauseScreen,
  SaveLoadScreen,
  onUiStep,
  useGame,
  useScreen,
  useUi,
  type Dialogue,
} from '@blacklight/ui';
import { slotsFor } from '@ui/state';

defineProps<{ dialogue: Dialogue }>();
const game = useGame();
const ui = useUi();
const screen = useScreen({ enter: 'fade' });
const slots = slotsFor(game);

const menu = () => ui.push(PauseScreen, { slots, titleScene: 'title' });

// The pause action opens the menu while the dialogue is on top. Escape is both pause and back:
// when back just closed a screen above (the backlog) in this step, it does not also open the menu.
onUiStep(
  () => {
    const input = game.input.uiPlayer(1);
    if (screen.isTop.value && input.pressed('pause') && !input.pressed('back')) menu();
  },
  { onlyOnTop: true },
);
</script>

<template>
  <DialogueBox
    :dialogue="dialogue"
    blip="blip"
    @backlog="ui.push(Backlog, { dialogue })"
    @save="ui.push(SaveLoadScreen, { mode: 'save', slots })"
    @load="ui.push(SaveLoadScreen, { mode: 'load', slots })"
    @menu="menu"
  />
</template>
