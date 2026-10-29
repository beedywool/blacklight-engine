<script setup lang="ts">
import { ref, shallowRef } from 'vue';
import { onUiStep, useGame, useScreen } from '../composables';
import { t } from '../i18n';
import type { SubtitleCue } from '../video';
import InputPrompt from '../components/InputPrompt.vue';
import VideoPlayer from '../components/VideoPlayer.vue';

/** Full-screen video; closes with `'ended'` or `'skipped'`. Open it with `playCutscene()`. */
const props = withDefaults(
  defineProps<{
    source: string | string[];
    subtitles?: string | SubtitleCue[];
    skip?: 'hold' | 'press' | false;
    bus?: 'music' | 'sfx' | 'voice';
    /** Hold duration to skip, ms. */
    holdTime?: number;
  }>(),
  { skip: 'hold', bus: 'music', holdTime: 700 },
);
const game = useGame();
// `back` skips (unless unskippable); the default back handling would close without a result.
const screen = useScreen({ onBack: () => (props.skip ? (finish('skipped'), true) : true) });
const player = ref<InstanceType<typeof VideoPlayer> | null>(null);
const hint = shallowRef(false);
const hold = shallowRef(0);
let done = false;
let hintTimer: ReturnType<typeof setTimeout> | undefined;

function finish(result: 'ended' | 'skipped') {
  if (done) return;
  done = true;
  player.value?.pause();
  screen.close(result);
}

onUiStep(() => {
  if (!props.skip || done) return;
  const input = game.input.uiPlayer(1);
  if (input.pressed('confirm') || input.pressed('pause')) {
    hint.value = true;
    clearTimeout(hintTimer);
    hintTimer = setTimeout(() => (hint.value = false), 2500);
    if (props.skip === 'press') finish('skipped');
  }
  if (props.skip === 'hold') {
    hold.value = input.held('confirm') ? hold.value + game.time.dt * 1000 : 0;
    if (hold.value >= props.holdTime) finish('skipped');
  }
});

function onClick() {
  if (!props.skip) return;
  if (props.skip === 'press' || hint.value) finish('skipped');
  hint.value = true;
}
</script>

<template>
  <div class="bl-cutscene" @click="onClick">
    <VideoPlayer
      ref="player"
      :src="source"
      :subtitles="subtitles"
      :bus="bus"
      fit="contain"
      @ended="finish('ended')"
      @error="finish('ended')"
    />
    <div v-if="skip && hint" class="bl-cutscene__skip">
      <InputPrompt action="confirm" :size="40" />
      <span>{{
        skip === 'hold'
          ? t('bl.cutscene.hold', {}, 'Hold to skip')
          : t('bl.cutscene.skip', {}, 'Skip')
      }}</span>
      <span
        v-if="skip === 'hold'"
        class="bl-cutscene__progress"
        :style="{ transform: `scaleX(${Math.min(1, hold / holdTime)})` }"
      />
    </div>
  </div>
</template>
