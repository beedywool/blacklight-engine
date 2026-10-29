<script setup lang="ts">
import { computed, inject, onBeforeUnmount, onMounted, ref, shallowRef, watch } from 'vue';
import type { Game } from '@blacklight/core';
import { accessibility } from '../a11y';
import { cueAt, loadSubtitles, videoSources, type SubtitleCue } from '../video';

/**
 * A video in a screen: background loops (`background`) or cutscenes. Plays every format of the
 * asset (`intro.webm`, `intro.mp4`) in the order the platform supports best, shows subtitles when
 * the player has them on, and follows the volume of a bus.
 */
const props = withDefaults(
  defineProps<{
    /** Asset name or path (`intro`, `@assets/video/intro`), URL, or a list of them. */
    src: string | string[];
    autoplay?: boolean;
    loop?: boolean;
    muted?: boolean;
    /** Fill the parent and stay behind the other content, muted and looping. */
    background?: boolean;
    /** `cover` crops to fill, `contain` letterboxes. */
    fit?: 'cover' | 'contain';
    /** Subtitles: cues, a `.vtt` asset or a URL. */
    subtitles?: string | SubtitleCue[];
    /** Bus whose volume (times master) the video's sound follows. */
    bus?: 'music' | 'sfx' | 'voice';
  }>(),
  { autoplay: true, loop: false, muted: false, background: false, fit: 'cover', bus: 'music' },
);
const emit = defineEmits<{ ended: []; error: [error: unknown]; time: [seconds: number] }>();
const game = inject<Game | undefined>('blacklight:game', undefined);
const video = ref<HTMLVideoElement | null>(null);
const cues = shallowRef<SubtitleCue[]>([]);
const time = shallowRef(0);
const sources = computed(() => {
  try {
    return videoSources(game, props.src);
  } catch (error) {
    emit('error', error);
    return [];
  }
});
const caption = computed(() => (accessibility.subtitles ? cueAt(cues.value, time.value) : ''));

watch(
  () => props.subtitles,
  async (value) => {
    try {
      cues.value = await loadSubtitles(game, value);
    } catch (error) {
      console.warn('[blacklight] Subtitles:', error);
      cues.value = [];
    }
  },
  { immediate: true },
);

function volume() {
  if (!video.value || !game) return;
  video.value.volume = Math.min(1, game.audio.volume('master') * game.audio.volume(props.bus));
}

let frame = 0;
function tick() {
  if (video.value) {
    time.value = video.value.currentTime;
    emit('time', time.value);
  }
  frame = requestAnimationFrame(tick);
}

async function play() {
  try {
    await video.value?.play();
  } catch (error) {
    // Autoplay with sound is refused before the first user gesture: retry muted for backgrounds.
    if (video.value && (props.background || props.muted)) {
      video.value.muted = true;
      await video.value.play().catch((e: unknown) => emit('error', e));
    } else emit('error', error);
  }
}

onMounted(() => {
  volume();
  if (props.autoplay) void play();
  frame = requestAnimationFrame(tick);
});
onBeforeUnmount(() => {
  cancelAnimationFrame(frame);
  video.value?.pause();
});

defineExpose({
  play,
  pause: () => video.value?.pause(),
  /** Jumps to the end: `ended` fires. */
  skip: () => {
    if (!video.value) return;
    video.value.pause();
    emit('ended');
  },
  element: video,
});
</script>

<template>
  <div class="bl-video" :class="{ 'bl-video--background': background }">
    <video
      ref="video"
      class="bl-video__media"
      :style="{ objectFit: fit }"
      :loop="loop || background"
      :muted="muted || background"
      playsinline
      preload="auto"
      @ended="emit('ended')"
      @error="emit('error', $event)"
    >
      <source
        v-for="(s, i) in sources"
        :key="s.src"
        :src="s.src"
        :type="s.type"
        @error="
          i === sources.length - 1 &&
          emit('error', new Error(`No playable source for ${String(src)}`))
        "
      />
    </video>
    <div
      v-if="caption"
      class="bl-subtitles"
      :style="{
        '--bl-subtitle-size': accessibility.subtitleSize,
        '--bl-subtitle-bg': accessibility.subtitleBackground,
      }"
    >
      <span class="bl-subtitles__line">{{ caption }}</span>
    </div>
  </div>
</template>
