<script setup lang="ts">
import { computed, inject, onBeforeUnmount, onMounted, ref, shallowRef, watch } from 'vue';
import type { Game } from '@blacklight/core';
import { lineLength, type Dialogue, type DialogueChoice } from '../dialogue';
import { t } from '../i18n';
import { iconUrl } from '../icons';
import { vFocus } from '../directives';
import RichText from './RichText.vue';

/** Playback mode of the box. */
type Mode = 'normal' | 'auto' | 'skip';

const props = withDefaults(
  defineProps<{
    dialogue: Dialogue;
    /** Image URL of a portrait; default: the image asset `<character>-<expression>`, else `<character>`. */
    portrait?: (character: string, expression: string) => string | undefined;
    /** Display names (and name plate colors) by speaker id; default: `t('speakers.<id>')`, else the id. */
    speakers?: Record<string, string | { name: string; color?: string }>;
    /** Show the AUTO / SKIP / LOG / SAVE / LOAD / MENU buttons. */
    quickMenu?: boolean;
    /** Pause after a line in auto mode, in ms (plus 30 ms per character). */
    autoDelay?: number;
    /** Skip mode also skips lines never read. */
    skipUnread?: boolean;
    /** Initial mode. */
    mode?: Mode;
    /** Typing sound for lines without a voice. */
    blip?: string;
  }>(),
  { quickMenu: true, autoDelay: 900, skipUnread: false, mode: 'normal' },
);
const emit = defineEmits<{
  backlog: [];
  save: [];
  load: [];
  menu: [];
  end: [];
  'update:mode': [mode: Mode];
}>();
const game = inject<Game | undefined>('blacklight:game', undefined);
const view = props.dialogue.view;
const text = ref<InstanceType<typeof RichText> | null>(null);
const mode = shallowRef<Mode>(props.mode);
watch(
  () => props.mode,
  (value) => (mode.value = value),
);
watch(mode, (value) => emit('update:mode', value));
const typing = shallowRef(false);
let timer: ReturnType<typeof setTimeout> | undefined;

const speakerName = computed(() => {
  const id = view.line?.speaker;
  if (!id) return undefined;
  const entry = props.speakers?.[id] ?? props.speakers?.[id.toLowerCase()];
  if (typeof entry === 'string') return { name: entry };
  if (entry) return entry;
  return { name: t(`speakers.${id.toLowerCase()}`, {}, id) };
});

function portraitUrl(character: string, expression: string): string {
  const custom = props.portrait?.(character, expression);
  if (custom) return custom;
  for (const key of [`${character}-${expression}`, `${character}_${expression}`, character]) {
    try {
      const path = game?.assets.find(key, { extensions: ['png', 'webp', 'svg', 'avif', 'jpg'] })[0];
      const url = path && game?.assets.url(path);
      if (url) return url;
    } catch {
      // Try the next name.
    }
  }
  return iconUrl(`${character}-${expression}`, game);
}

function clearTimer() {
  clearTimeout(timer);
  timer = undefined;
}

/** Confirm on the box: finish the line, else go to the next one. */
function advance() {
  if (view.choices.length > 0) return;
  if (typing.value) {
    text.value?.skip();
    return;
  }
  next();
}

function next() {
  clearTimer();
  if (view.line) props.dialogue.markRead(view.line);
  if (!props.dialogue.next() && props.dialogue.ended) emit('end');
}

function choose(choice: DialogueChoice) {
  clearTimer();
  if (mode.value === 'skip') mode.value = 'normal';
  props.dialogue.choose(choice.index);
}

function onLine() {
  typing.value = true;
  clearTimer();
  if (mode.value === 'skip') scheduleSkip();
}

function onDone() {
  typing.value = false;
  if (mode.value === 'auto') scheduleAuto();
}

function scheduleAuto() {
  clearTimer();
  const line = view.line;
  if (!line || view.choices.length > 0) return;
  const voice = props.dialogue.playingVoice?.ended ?? Promise.resolve();
  void voice.then(() => {
    if (mode.value !== 'auto' || view.line !== line) return;
    timer = setTimeout(
      () => {
        if (mode.value === 'auto' && view.line === line) next();
      },
      props.autoDelay + 30 * lineLength(line),
    );
  });
}

function scheduleSkip() {
  clearTimer();
  timer = setTimeout(() => {
    if (mode.value !== 'skip') return;
    if (view.choices.length > 0 || props.dialogue.ended) {
      mode.value = 'normal';
      return;
    }
    if (!props.skipUnread && !props.dialogue.isRead()) {
      // Skip stops at the first line the player has not read.
      mode.value = 'normal';
      return;
    }
    text.value?.skip();
    next();
  }, 70);
}

watch(mode, (value) => {
  clearTimer();
  if (value === 'auto' && !typing.value) scheduleAuto();
  if (value === 'skip') scheduleSkip();
});
watch(
  () => view.line,
  (line) => line && onLine(),
  { immediate: true },
);

const toggle = (value: Mode) => (mode.value = mode.value === value ? 'normal' : value);

// Holding Ctrl skips, like most visual novels; the mouse wheel up opens the backlog.
let held = false;
function onKey(event: KeyboardEvent) {
  if (event.key !== 'Control') return;
  if (event.type === 'keydown' && !held) {
    held = true;
    mode.value = 'skip';
  } else if (event.type === 'keyup') {
    held = false;
    if (mode.value === 'skip') mode.value = 'normal';
  }
}
function onWheel(event: WheelEvent) {
  if (event.deltaY < 0) emit('backlog');
}
onMounted(() => {
  window.addEventListener('keydown', onKey);
  window.addEventListener('keyup', onKey);
});
onBeforeUnmount(() => {
  clearTimer();
  window.removeEventListener('keydown', onKey);
  window.removeEventListener('keyup', onKey);
  props.dialogue.saveRead();
});

defineExpose({ advance, mode });
</script>

<template>
  <div class="bl-dialogue" :data-mode="mode" :data-typing="typing || undefined" @wheel="onWheel">
    <TransitionGroup tag="div" name="bl-portrait" class="bl-dialogue__portraits">
      <img
        v-for="p in view.portraits"
        :key="p.character"
        class="bl-dialogue__portrait"
        :class="[
          `bl-dialogue__portrait--${p.position}`,
          { 'bl-dialogue__portrait--speaking': view.line?.speaker?.toLowerCase() === p.character },
        ]"
        :src="portraitUrl(p.character, p.expression)"
        :alt="`${p.character} (${p.expression})`"
        :data-character="p.character"
        :data-expression="p.expression"
        draggable="false"
      />
    </TransitionGroup>

    <div v-if="view.choices.length > 0" class="bl-dialogue__choices" data-bl-focus-group="wrap y">
      <button
        v-for="(choice, i) in view.choices"
        :key="choice.index"
        v-focus
        :data-bl-autofocus="i === 0 || undefined"
        class="bl-dialogue__choice"
        type="button"
        @click="choose(choice)"
      >
        <RichText :text="choice.text" />
      </button>
    </div>

    <div
      v-if="view.line"
      v-focus
      class="bl-dialogue__box"
      data-bl-autofocus
      role="log"
      aria-live="polite"
      @click="advance"
    >
      <div
        v-if="speakerName"
        class="bl-dialogue__name"
        :style="speakerName.color ? { '--bl-name-color': speakerName.color } : undefined"
      >
        {{ speakerName.name }}
      </div>
      <p class="bl-dialogue__text">
        <RichText
          ref="text"
          :key="view.line.id + view.backlog.length"
          :text="view.line.text"
          :typewriter="mode === 'skip' ? 0 : true"
          :blip="view.line.voice ? undefined : blip"
          @done="onDone"
        />
      </p>
      <span v-if="!typing" class="bl-dialogue__next" aria-hidden="true" />
    </div>

    <nav v-if="quickMenu" class="bl-dialogue__quick">
      <button
        v-focus
        type="button"
        :class="{ 'bl-dialogue__quick--on': mode === 'auto' }"
        @click="toggle('auto')"
      >
        {{ t('bl.dialogue.auto', {}, 'AUTO') }}
      </button>
      <button
        v-focus
        type="button"
        :class="{ 'bl-dialogue__quick--on': mode === 'skip' }"
        @click="toggle('skip')"
      >
        {{ t('bl.dialogue.skip', {}, 'SKIP') }}
      </button>
      <button v-focus type="button" @click="emit('backlog')">
        {{ t('bl.dialogue.log', {}, 'LOG') }}
      </button>
      <button v-focus type="button" @click="emit('save')">
        {{ t('bl.dialogue.save', {}, 'SAVE') }}
      </button>
      <button v-focus type="button" @click="emit('load')">
        {{ t('bl.dialogue.load', {}, 'LOAD') }}
      </button>
      <button v-focus type="button" @click="emit('menu')">
        {{ t('bl.dialogue.menu', {}, 'MENU') }}
      </button>
    </nav>
  </div>
</template>
