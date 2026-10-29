<script setup lang="ts">
import { computed, onBeforeUnmount, shallowRef } from 'vue';
import type { Device } from '@blacklight/core';
import { useGame, useInputDevice } from '../composables';
import { bindingForDevice, glyphFor } from '../prompts';

const props = withDefaults(
  defineProps<{
    /** Input action whose button to show. */
    action: string;
    player?: number;
    /** Force a device instead of following the last one used. */
    device?: Device;
    /** Size in virtual pixels. */
    size?: number;
    /** Text shown after the glyph ("Confirm"). */
    label?: string;
  }>(),
  { player: 1, size: 48 },
);

const game = useGame();
const { device, family } = useInputDevice(props.player);
const version = shallowRef(0);
const off = game.input.events.on('bindings', () => version.value++);
onBeforeUnmount(off);

const glyph = computed(() => {
  void version.value;
  const used = props.device ?? device.value;
  const bindings = game.input.bindingsOf(props.action);
  // Mouse and touch players see keyboard keys before pad buttons when their device has none.
  const fallbacks: Device[] = used === 'gamepad' ? ['keyboard'] : ['keyboard', 'gamepad'];
  const binding =
    bindingForDevice(bindings, used) ??
    fallbacks.map((d) => bindingForDevice(bindings, d)).find(Boolean) ??
    bindings[0];
  if (!binding) return { text: props.action };
  const art = binding.startsWith('Pad:')
    ? family.value
    : binding.startsWith('Mouse:')
      ? 'mouse'
      : binding === 'Touch'
        ? 'touch'
        : 'keyboard';
  return glyphFor(binding, art);
});
</script>

<template>
  <span class="bl-prompt" :style="{ '--bl-prompt-size': `${size}px` }">
    <img
      v-if="glyph.src"
      class="bl-prompt__glyph"
      :src="glyph.src"
      :alt="glyph.text"
      draggable="false"
    />
    <span v-else class="bl-prompt__key">{{ glyph.text }}</span>
    <span v-if="label" class="bl-prompt__label">{{ label }}</span>
  </span>
</template>
