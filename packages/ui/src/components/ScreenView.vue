<script setup lang="ts">
import { computed, provide, ref, watch } from 'vue';
import type { ScreenEntry, UiRuntime } from '../runtime';
import { getTransition } from '../transitions';

const props = defineProps<{ entry: ScreenEntry; runtime: UiRuntime }>();
provide('blacklight:screen', props.entry);
const element = ref<HTMLElement | null>(null);
const shown = computed(() => !props.entry.closing);
const state = computed(() => props.runtime.covered(props.entry));

watch(element, (el) => {
  // The entry is the runtime's reactive record of this screen, shared on purpose.
  // eslint-disable-next-line vue/no-mutating-props
  props.entry.element = el;
  props.runtime.update();
});

// A transition that fails must not leave the screen stuck half in or out.
async function enter(el: Element, done: () => void) {
  try {
    await getTransition(props.entry.enter)?.enter(el as HTMLElement);
  } catch (error) {
    console.error(`[blacklight] Screen transition "${props.entry.enter}" failed:`, error);
  } finally {
    done();
    props.runtime.update();
  }
}

async function leave(el: Element, done: () => void) {
  try {
    await getTransition(props.entry.leave)?.leave(el as HTMLElement);
  } catch (error) {
    console.error(`[blacklight] Screen transition "${props.entry.leave}" failed:`, error);
  } finally {
    done();
  }
}
</script>

<template>
  <Transition
    :css="false"
    appear
    @enter="enter"
    @leave="leave"
    @after-leave="runtime.remove(entry)"
  >
    <div
      v-if="shown"
      ref="element"
      class="bl-screen"
      :class="[`bl-screen--${entry.mode}`, { 'bl-screen--hidden': state === 'hidden' }]"
      data-bl-screen
      :inert="state !== 'visible' || undefined"
    >
      <div v-if="entry.mode === 'modal'" class="bl-scrim" />
      <component :is="entry.component" v-bind="entry.props" />
    </div>
  </Transition>
</template>
