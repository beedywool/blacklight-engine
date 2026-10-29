<script setup lang="ts">
import { computed, inject, onBeforeUnmount, shallowRef, watch } from 'vue';
import type { Game } from '@blacklight/core';
import { accessibility, prefersReducedMotion } from '../a11y';
import { lineBreaks, useI18n } from '../i18n';
import {
  graphemes,
  JOINING_SCRIPT,
  parseRichText,
  revealSchedule,
  visibleCount,
  type RichNode,
  type RunStyle,
} from '../richtext';
import { iconUrl } from '../icons';
import InputPrompt from './InputPrompt.vue';

const props = withDefaults(
  defineProps<{
    /** Text with rich-text tags. */
    text: string;
    /** Reveal characters over time: `true` uses the player's text speed, a number is characters per second. */
    typewriter?: boolean | number;
    /** Stops the typewriter where it is. */
    paused?: boolean;
    /** How each character appears with the typewriter (needs one element per character). */
    appear?: 'none' | 'fade' | 'rise';
    /** Language of the text (line breaking); the current UI language by default. */
    lang?: string;
    /** Sound played on the `ui` bus every `blipEvery` characters while typing. */
    blip?: string;
    blipEvery?: number;
  }>(),
  { typewriter: false, paused: false, appear: 'none', blipEvery: 2 },
);
const emit = defineEmits<{ done: []; char: [index: number] }>();
const game = inject<Game | undefined>('blacklight:game', undefined);
const i18n = useI18n();

const language = computed(() => props.lang ?? i18n.locale.value);
const nodes = computed(() =>
  parseRichText(props.text).map((node) =>
    node.kind === 'text' ? { ...node, text: lineBreaks(node.text, language.value) } : node,
  ),
);
const speed = computed(() =>
  props.typewriter === false
    ? 0
    : props.typewriter === true
      ? accessibility.textSpeed
      : props.typewriter,
);
const schedule = computed(() => revealSchedule(nodes.value, speed.value));
const total = computed(() => schedule.value.length);

/** Units shown; `total` when the text is complete. */
const shown = shallowRef(0);
const elapsed = shallowRef(0);
let frame = 0;
let last = 0;

function stop() {
  cancelAnimationFrame(frame);
  frame = 0;
}

function tick(now: number) {
  frame = 0;
  if (!props.paused) elapsed.value += Math.min(100, now - last);
  last = now;
  update();
  if (shown.value < total.value) frame = requestAnimationFrame(tick);
}

function update() {
  const before = shown.value;
  shown.value = visibleCount(schedule.value, elapsed.value);
  if (shown.value > before) {
    emit('char', shown.value - 1);
    if (
      props.blip &&
      game &&
      Math.floor(shown.value / props.blipEvery) > Math.floor(before / props.blipEvery)
    ) {
      try {
        game.audio.play(props.blip, { bus: 'ui' });
      } catch {
        // Sound not loaded: typing stays silent.
      }
    }
  }
  if (shown.value >= total.value && before < total.value) emit('done');
}

function start() {
  stop();
  elapsed.value = 0;
  shown.value = 0;
  if (speed.value <= 0 || prefersReducedMotion()) {
    shown.value = total.value;
    emit('done');
    return;
  }
  last = performance.now();
  update();
  if (shown.value < total.value) frame = requestAnimationFrame(tick);
}

watch(() => [props.text, speed.value], start, { immediate: true });
onBeforeUnmount(stop);

/** Shows the whole text now (a player pressing confirm while it types). */
function skip(): void {
  if (shown.value >= total.value) return;
  stop();
  elapsed.value = Infinity;
  update();
}

defineExpose({
  skip,
  restart: start,
  /** `true` once every character is visible. */
  finished: computed(() => shown.value >= total.value),
});

function styleOf(style: RunStyle) {
  return {
    color: style.color,
    fontSize: style.size,
    fontWeight: style.bold ? 'bold' : undefined,
    fontStyle: style.italic ? 'italic' : undefined,
    textDecoration: style.underline ? 'underline' : undefined,
    '--bl-rt-amp': style.amplitude ?? 1,
  };
}

interface Piece {
  key: number;
  node: Exclude<RichNode, { kind: 'pause' }>;
  /** Index of the piece's first unit in the reveal schedule. */
  first: number;
  chars: string[];
  /** One element per character (effects, appear animation). */
  perChar: boolean;
}

const pieces = computed(() => {
  let unit = 0;
  const out: Piece[] = [];
  nodes.value.forEach((node, key) => {
    if (node.kind === 'pause') return;
    const first = unit;
    if (node.kind === 'text') {
      const chars = graphemes(node.text);
      unit += chars.length;
      const perChar =
        (node.style.effect !== undefined || props.appear !== 'none') &&
        !JOINING_SCRIPT.test(node.text);
      out.push({ key, node, first, chars, perChar });
      return;
    }
    unit += 1;
    out.push({ key, node, first, chars: [], perChar: false });
  });
  return out;
});
</script>

<template>
  <span
    class="bl-rich-text"
    :class="{ 'bl-rich-text--typing': shown < total }"
    :data-appear="appear !== 'none' ? appear : undefined"
  >
    <template v-for="piece in pieces" :key="piece.key">
      <span
        v-if="piece.node.kind === 'text' && piece.perChar"
        class="bl-rt-run"
        :class="piece.node.style.effect && `bl-rt-${piece.node.style.effect}`"
        :style="styleOf(piece.node.style)"
        ><span
          v-for="(char, i) in piece.chars"
          :key="i"
          class="bl-rt-ch"
          :class="{ 'bl-rt-hidden': piece.first + i >= shown }"
          :style="{ '--i': piece.first + i }"
          >{{ char }}</span
        ></span
      >
      <span
        v-else-if="piece.node.kind === 'text'"
        class="bl-rt-run"
        :style="styleOf(piece.node.style)"
        ><span>{{ piece.chars.slice(0, Math.max(0, shown - piece.first)).join('') }}</span
        ><span class="bl-rt-hidden">{{
          piece.chars.slice(Math.max(0, shown - piece.first)).join('')
        }}</span></span
      >
      <img
        v-else-if="piece.node.kind === 'icon'"
        class="bl-rt-icon"
        :class="{ 'bl-rt-hidden': piece.first >= shown }"
        :src="iconUrl(piece.node.name, game)"
        :alt="piece.node.name"
        :style="styleOf(piece.node.style)"
        draggable="false"
      />
      <span
        v-else-if="piece.node.kind === 'input'"
        class="bl-rt-input"
        :class="{ 'bl-rt-hidden': piece.first >= shown }"
        :style="styleOf(piece.node.style)"
        ><InputPrompt :action="piece.node.action" :size="40"
      /></span>
    </template>
  </span>
</template>
