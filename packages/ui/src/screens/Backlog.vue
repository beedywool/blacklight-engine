<script setup lang="ts">
import { nextTick, onMounted, ref } from 'vue';
import type { Dialogue } from '../dialogue';
import { useScreen } from '../composables';
import { t } from '../i18n';
import { vFocus } from '../directives';
import RichText from '../components/RichText.vue';
import InputPrompt from '../components/InputPrompt.vue';

/** The dialogue history: every line and choice, newest last; `confirm` on a line replays its voice. */
const props = defineProps<{
  dialogue: Dialogue;
  /** Display names by speaker id; default `t('speakers.<id>')`. */
  speakers?: Record<string, string | { name: string }>;
}>();
useScreen({ enter: 'slide-up', leave: 'slide-down' });
const list = ref<HTMLElement | null>(null);

function nameOf(id: string | undefined): string {
  if (!id) return '';
  const entry = props.speakers?.[id] ?? props.speakers?.[id.toLowerCase()];
  if (typeof entry === 'string') return entry;
  return entry?.name ?? t(`speakers.${id.toLowerCase()}`, {}, id);
}

onMounted(async () => {
  await nextTick();
  // The newest line is at the bottom: start there.
  const rows = list.value?.querySelectorAll<HTMLElement>('[data-bl-focus]');
  const last = rows?.[rows.length - 1];
  if (last) last.setAttribute('data-bl-autofocus', '');
  if (list.value) list.value.scrollTop = list.value.scrollHeight;
});
</script>

<template>
  <div class="bl-backlog">
    <h1 class="bl-backlog__title">{{ t('bl.backlog.title', {}, 'LOG') }}</h1>
    <div ref="list" class="bl-backlog__list" data-bl-focus-group="y">
      <div
        v-for="(entry, i) in dialogue.view.backlog"
        :key="i"
        v-focus
        class="bl-backlog__entry"
        :class="{ 'bl-backlog__entry--choice': entry.choice }"
        @click="dialogue.replayVoice(entry)"
      >
        <span class="bl-backlog__speaker">{{ entry.choice ? '›' : nameOf(entry.speaker) }}</span>
        <span class="bl-backlog__text"><RichText :text="entry.text" /></span>
        <span v-if="entry.voice" class="bl-backlog__voice" aria-label="voice">♪</span>
      </div>
    </div>
    <div class="bl-backlog__prompts">
      <InputPrompt action="back" :label="t('bl.common.back', {}, 'BACK')" :size="40" />
    </div>
  </div>
</template>
