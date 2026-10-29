<script setup lang="ts">
import { computed } from 'vue';
import { FOCUS_ATTR } from '../focus';

const props = withDefaults(
  defineProps<{
    /** Skew in degrees; the theme's `--bl-skew` when omitted. */
    angle?: number;
    /** Highlighted state (focused menu row). */
    active?: boolean;
    /** Make it focusable; `confirm` fires when activated. */
    focusable?: boolean;
    /** Background color (CSS). */
    color?: string;
    /** Color of the offset drop shadow, Persona style; none when omitted. */
    shadow?: string;
    /** Text outline width in px. */
    outline?: number;
    /** Keep the content upright inside the skewed box. @defaultValue `true` */
    upright?: boolean;
  }>(),
  { active: false, focusable: false, upright: true },
);
const emit = defineEmits<{ confirm: [] }>();

const angle = computed(() => (props.angle === undefined ? 'var(--bl-skew)' : `${props.angle}deg`));
const style = computed(() => ({
  '--bl-skew-angle': angle.value,
  ...(props.color ? { '--bl-skew-color': props.color } : {}),
  ...(props.shadow ? { '--bl-shadow-color': props.shadow } : {}),
  ...(props.outline ? { '--bl-outline-width': `${props.outline}px` } : {}),
}));
const attrs = computed(() => (props.focusable ? { [FOCUS_ATTR]: '', role: 'button' } : {}));
</script>

<template>
  <div
    class="bl-skew"
    :class="{ 'bl-skew--active': active, 'bl-skew--shadow': shadow, 'bl-outline': outline }"
    :style="style"
    v-bind="attrs"
    @click="focusable && emit('confirm')"
  >
    <span class="bl-skew__content" :class="{ 'bl-skew__content--upright': upright }"><slot /></span>
  </div>
</template>
