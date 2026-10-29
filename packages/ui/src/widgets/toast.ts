import { shallowReactive } from 'vue';

export interface Toast {
  id: number;
  message: string;
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
  options: { duration?: number; kind?: Toast['kind'] } = {},
): void {
  const item: Toast = { id: next++, message, kind: options.kind ?? 'info' };
  toasts.push(item);
  setTimeout(() => {
    const index = toasts.indexOf(item);
    if (index >= 0) toasts.splice(index, 1);
  }, options.duration ?? 2600);
}

/** Composable form of {@link toast}. */
export function useToast(): typeof toast {
  return toast;
}
