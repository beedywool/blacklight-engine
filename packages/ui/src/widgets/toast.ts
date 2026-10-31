import { shallowReactive } from 'vue';

/** A message shown by {@link toast}, drawn by `<ToastHost>`. */
export interface Toast {
  /** Unique number, used as the Vue key. */
  id: number;
  /** Text shown. */
  message: string;
  /** Look of the toast: neutral, success or error colors. */
  kind: 'info' | 'success' | 'error';
}

/** Toasts on screen, newest last. */
export const toasts: Toast[] = shallowReactive([]);
let next = 1;

/**
 * Shows a short message in a corner for `duration` ms. Toasts never take focus.
 *
 * @example
 * ```ts
 * toast('Game saved', { kind: 'success' });
 * ```
 */
export function toast(
  message: string,
  options: {
    /** Time on screen in ms. @defaultValue `2600` */
    duration?: number;
    /** Look of the toast. @defaultValue `'info'` */
    kind?: Toast['kind'];
  } = {},
): void {
  const item: Toast = { id: next++, message, kind: options.kind ?? 'info' };
  toasts.push(item);
  setTimeout(() => {
    const index = toasts.indexOf(item);
    if (index >= 0) toasts.splice(index, 1);
  }, options.duration ?? 2600);
}

/**
 * Composable form of {@link toast}, for components that prefer injection-style APIs.
 *
 * @example
 * ```ts
 * import { useToast } from '@blacklight/ui';
 *
 * const toast = useToast();
 * toast('Settings saved', { kind: 'success', duration: 1500 });
 * ```
 */
export function useToast(): typeof toast {
  return toast;
}
