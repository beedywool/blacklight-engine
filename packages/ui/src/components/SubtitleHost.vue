<script setup lang="ts">
import { accessibility } from '../a11y';
import { subtitleLines } from '../video';
</script>

<template>
  <div
    v-if="accessibility.subtitles && subtitleLines.length > 0"
    class="bl-subtitles bl-subtitles--global"
    aria-live="polite"
    :style="{
      '--bl-subtitle-size': accessibility.subtitleSize,
      '--bl-subtitle-bg': accessibility.subtitleBackground,
    }"
  >
    <span v-for="line in subtitleLines" :key="line.id" class="bl-subtitles__line"
      ><b v-if="line.speaker">{{ line.speaker }}: </b>{{ line.text }}</span
    >
  </div>
</template>
