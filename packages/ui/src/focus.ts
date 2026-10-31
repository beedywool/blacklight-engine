import { shallowRef, type ShallowRef } from 'vue';
import { pickNext, wrapTarget, type Box, type Direction } from './spatial';

/** Attribute that makes an element focusable by the gamepad / keyboard focus. */
export const FOCUS_ATTR = 'data-bl-focus';
/** Attribute set on the focused element (style it with `[data-bl-focused]`). */
export const FOCUSED_ATTR = 'data-bl-focused';
/** Attribute of a focus group; its value lists options: `wrap`, `trap`, `x`, `y`. */
export const GROUP_ATTR = 'data-bl-focus-group';
/** Attribute of the element focused first in a screen. */
export const AUTOFOCUS_ATTR = 'data-bl-autofocus';

/** Theme UI sounds played by focus and navigation: see `Theme.sounds`. */
export type FocusSound = 'move' | 'confirm' | 'back' | 'error';

/** Navigation event dispatched on the focused element before focus moves; cancel it to keep focus (sliders, selects). */
export interface NavigateDetail {
  /** Direction pressed. */
  direction: Direction;
}

function rect(element: Element): Box {
  const r = element.getBoundingClientRect();
  return { x: r.left, y: r.top, width: r.width, height: r.height };
}

function options(group: Element | null): Set<string> {
  return new Set((group?.getAttribute(GROUP_ATTR) ?? '').split(/\s+/).filter(Boolean));
}

/**
 * Spatial focus for gamepads and keyboards over DOM screens: directional moves pick the nearest
 * element on screen, groups can wrap or trap focus, and the last focus is remembered per group and
 * per screen. Mouse and touch move the same focus. The UI layer creates one (`runtime.focus`);
 * mark elements focusable with `v-focus` or {@link FOCUS_ATTR}.
 *
 * @example
 * ```ts
 * import { useUiRuntime } from '@blacklight/ui';
 *
 * const { focus } = useUiRuntime();
 * focus.focus(document.querySelector<HTMLElement>('#continue'));
 * focus.move('down');
 * watch(focus.current, (element) => console.log('focused', element?.textContent));
 * ```
 */
export class FocusManager {
  /** The focused element, reactive for components. */
  readonly current: ShallowRef<HTMLElement | null> = shallowRef(null);
  private readonly memory = new WeakMap<Element, HTMLElement>();
  private scope: HTMLElement | null = null;
  private observer: MutationObserver | undefined;

  constructor(
    private readonly root: HTMLElement,
    private readonly hooks: { sound(kind: FocusSound): void },
  ) {
    root.addEventListener('pointerover', (event) => this.fromPointer(event, false));
    root.addEventListener('pointerdown', (event) => this.fromPointer(event, true));
    // Widgets that render their rows lazily (ScrollList) ask for focus once a row exists.
    root.addEventListener('bl-request-focus', (event) => {
      const target = event.target as HTMLElement;
      if (this.eligible(target)) this.focus(target);
    });
  }

  private fromPointer(event: PointerEvent, pressed: boolean): void {
    const target = (event.target as Element | null)?.closest<HTMLElement>(`[${FOCUS_ATTR}]`);
    if (!target || !this.eligible(target)) return;
    if (target !== this.current.value) this.focus(target, { sound: !pressed });
  }

  /** Restricts focus to one screen element (the top screen, or the top modal). */
  setScope(scope: HTMLElement | null): void {
    if (scope === this.scope) return;
    this.scope = scope;
    // Screens fill in later (async components, tabs, v-if): refocus when focus is lost or
    // focusable elements appear in an empty screen.
    this.observer?.disconnect();
    if (scope && typeof MutationObserver !== 'undefined') {
      this.observer = new MutationObserver(() => {
        const current = this.current.value;
        if (this.scope === scope && (!current || !current.isConnected || !scope.contains(current)))
          this.restore(scope);
      });
      this.observer.observe(scope, { childList: true, subtree: true });
    }
    if (!scope) {
      this.focus(null);
      return;
    }
    if (this.current.value && scope.contains(this.current.value)) return;
    this.restore(scope);
  }

  /** Focuses the remembered element of a screen, its `data-bl-autofocus` element, or its first focusable. */
  restore(scope: HTMLElement): void {
    const remembered = this.memory.get(scope);
    if (remembered?.isConnected && this.eligible(remembered))
      return this.focus(remembered, { sound: false });
    const items = this.focusables(scope);
    const auto = items.find((e) => e.hasAttribute(AUTOFOCUS_ATTR));
    this.focus(auto ?? items[0] ?? null, { sound: false });
  }

  /** Focusable, enabled, visible elements in `container` that belong to the current scope. */
  focusables(container: Element | null = this.scope): HTMLElement[] {
    if (!container) return [];
    return [...container.querySelectorAll<HTMLElement>(`[${FOCUS_ATTR}]`)].filter((e) =>
      this.eligible(e),
    );
  }

  private eligible(element: HTMLElement): boolean {
    if (!this.scope || !this.scope.contains(element)) return false;
    if (element.hasAttribute('disabled') || element.getAttribute('aria-disabled') === 'true')
      return false;
    return !element.closest('[inert]');
  }

  /** Focuses an element (or nothing). */
  focus(element: HTMLElement | null, { sound = true }: { sound?: boolean } = {}): void {
    const previous = this.current.value;
    if (previous === element) return;
    previous?.removeAttribute(FOCUSED_ATTR);
    this.current.value = element;
    if (!element) return;
    element.setAttribute(FOCUSED_ATTR, '');
    if (
      !element.hasAttribute('tabindex') &&
      !/^(BUTTON|INPUT|SELECT|TEXTAREA|A)$/.test(element.tagName)
    ) {
      element.setAttribute('tabindex', '-1');
    }
    element.focus({ preventScroll: true });
    element.scrollIntoView?.({ block: 'nearest', inline: 'nearest' });
    for (
      let node: Element | null = element.closest(`[${GROUP_ATTR}]`);
      node;
      node = node.parentElement?.closest(`[${GROUP_ATTR}]`) ?? null
    ) {
      this.memory.set(node, element);
    }
    if (this.scope) this.memory.set(this.scope, element);
    if (sound) this.hooks.sound('move');
  }

  /**
   * Moves focus. The focused element first receives a cancelable `bl-navigate` event; a group
   * keeps focus inside when it traps, and wraps around when asked.
   *
   * @returns `true` when the focus moved or a widget used the input.
   */
  move(direction: Direction): boolean {
    const current = this.current.value;
    if (!current) {
      const first = this.focusables()[0];
      if (first) this.focus(first);
      return !!first;
    }
    const event = new CustomEvent<NavigateDetail>('bl-navigate', {
      detail: { direction },
      cancelable: true,
      bubbles: true,
    });
    if (!current.dispatchEvent(event)) return true;

    const from = rect(current);
    const group = current.closest(`[${GROUP_ATTR}]`);
    const opts = options(group);
    const horizontal = direction.includes('left') || direction.includes('right');
    const vertical = direction.includes('up') || direction.includes('down');
    const axisAllowed = !(opts.has('x') && !horizontal) && !(opts.has('y') && !vertical);

    if (group && axisAllowed) {
      const inGroup = this.focusables(group)
        .filter((e) => e !== current)
        .map((item) => ({ item, box: rect(item) }));
      const next =
        pickNext(from, inGroup, direction) ??
        (opts.has('wrap') ? wrapTarget(from, inGroup, direction) : undefined);
      if (next) return this.go(next);
      if (opts.has('trap')) return false;
    } else if (group && opts.has('trap')) {
      return false;
    }

    const all = this.focusables().filter((e) => e !== current && (!group || !group.contains(e)));
    const target = pickNext(
      from,
      all.map((item) => ({ item, box: rect(item) })),
      direction,
    );
    if (!target) return false;
    // Entering a group lands on its remembered element.
    const targetGroup = target.closest(`[${GROUP_ATTR}]`);
    const remembered =
      targetGroup && targetGroup !== group ? this.memory.get(targetGroup) : undefined;
    return this.go(remembered?.isConnected && this.eligible(remembered) ? remembered : target);
  }

  private go(element: HTMLElement): boolean {
    this.focus(element);
    return true;
  }

  /** Activates the focused element (a click, which buttons and widgets handle). */
  confirm(): boolean {
    const current = this.current.value;
    if (!current) return false;
    this.hooks.sound('confirm');
    current.click();
    return true;
  }
}
