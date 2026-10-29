import type { Directive } from 'vue';
import { AUTOFOCUS_ATTR, FOCUS_ATTR } from './focus';

/**
 * Makes an element focusable by gamepad and keyboard navigation; `v-focus.auto` focuses it first
 * when its screen opens.
 */
export const vFocus: Directive<HTMLElement, boolean | undefined> = {
  mounted(element, binding) {
    if (binding.value === false) return;
    element.setAttribute(FOCUS_ATTR, '');
    if (binding.modifiers.auto) element.setAttribute(AUTOFOCUS_ATTR, '');
  },
  updated(element, binding) {
    if (binding.value === false) element.removeAttribute(FOCUS_ATTR);
    else element.setAttribute(FOCUS_ATTR, '');
    if (binding.modifiers.auto) element.setAttribute(AUTOFOCUS_ATTR, '');
  },
};
