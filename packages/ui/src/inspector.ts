import { isRef, toRaw, unref } from 'vue';
import type { Game } from '@blacklight/core';
import { UiRuntime } from './runtime';

/** The parts of a Vue component instance the inspector reads (dev builds only). */
interface ComponentLike {
  type: { __name?: string; name?: string; __file?: string };
  props: Record<string, unknown>;
  setupState?: Record<string, unknown>;
  parent: ComponentLike | null;
}

/** Vue sets `__vueParentComponent` on elements in development builds. */
function componentOf(element: Element | null): ComponentLike | undefined {
  for (let node = element; node; node = node.parentElement) {
    const instance = (node as Element & { __vueParentComponent?: ComponentLike }).__vueParentComponent;
    if (instance) return instance;
  }
  return undefined;
}

/** Display name of a component: its `name`, its file name, or `Anonymous`. */
export function componentName(instance: ComponentLike): string {
  const type = instance.type;
  return (
    type.__name ?? type.name ?? type.__file?.split('/').pop()?.replace(/\.vue$/, '') ?? 'Anonymous'
  );
}

function preview(value: unknown, depth = 0): string {
  const raw = isRef(value) ? unref(value) : value;
  if (raw === null || raw === undefined) return String(raw);
  if (typeof raw === 'function') return 'ƒ';
  if (typeof raw === 'string') return JSON.stringify(raw.length > 60 ? `${raw.slice(0, 57)}…` : raw);
  if (typeof raw !== 'object') return String(raw);
  if (raw instanceof Element) return `<${raw.tagName.toLowerCase()}>`;
  if (depth > 0) return Array.isArray(raw) ? `Array(${raw.length})` : '{…}';
  const object = toRaw(raw) as Record<string, unknown>;
  if (Array.isArray(object)) return `[${object.slice(0, 5).map((v) => preview(v, 1)).join(', ')}${object.length > 5 ? ', …' : ''}]`;
  const keys = Object.keys(object).slice(0, 6);
  return `{ ${keys.map((k) => `${k}: ${preview(object[k], 1)}`).join(', ')}${Object.keys(object).length > 6 ? ', …' : ''} }`;
}

/** What the inspector shows for an element. */
export interface InspectedComponent {
  /** Component chain from the screen down to the hovered component. */
  path: string[];
  name: string;
  props: Record<string, string>;
  state: Record<string, string>;
}

/** Reads the component under `element` (dev builds only). */
export function inspectElement(element: Element | null): InspectedComponent | undefined {
  const instance = componentOf(element);
  if (!instance) return undefined;
  const path: string[] = [];
  for (let node: ComponentLike | null = instance; node; node = node.parent) path.unshift(componentName(node));
  const props: Record<string, string> = {};
  for (const [key, value] of Object.entries(instance.props ?? {})) props[key] = preview(value);
  const state: Record<string, string> = {};
  for (const [key, value] of Object.entries(toRaw(instance.setupState ?? {}))) {
    if (key.startsWith('__') || typeof value === 'function') continue;
    state[key] = preview(value);
  }
  return { path: path.filter((n) => n !== 'UiRoot' && n !== 'ScreenView'), name: componentName(instance), props, state };
}

const escape = (text: string) =>
  text.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!);

/**
 * Dev UI inspector (UI-18): F9 toggles a panel with the component under the pointer (its chain,
 * props and state), the focused element and its screen, and the screen stack. The CLI installs it
 * in dev builds only; release builds do not contain it.
 *
 * @example
 * ```ts
 * if (import.meta.env.DEV) (await import('@blacklight/ui/inspector')).installInspector(game);
 * ```
 */
export function installInspector(game: Game, options: { key?: string } = {}): { toggle(): void; destroy(): void } {
  if (!(game.ui instanceof UiRuntime)) {
    throw new Error('installInspector() needs the UI layer: install @blacklight/ui first.');
  }
  const runtime = game.ui;
  const key = options.key ?? 'F9';
  const panel = document.createElement('div');
  panel.className = 'bl-inspector';
  panel.hidden = true;
  const outline = document.createElement('div');
  outline.className = 'bl-inspector__outline';
  outline.hidden = true;
  game.mount.append(outline, panel);
  let hovered: Element | null = null;
  let frame = 0;

  const render = () => {
    frame = 0;
    if (panel.hidden) return;
    const info = inspectElement(hovered);
    const focused = runtime.focus.current.value;
    const screenOf = (el: Element | null) => {
      const element = el?.closest('[data-bl-screen]');
      const entry = runtime.entries.find((e) => e.element === element);
      if (!entry) return '—';
      const component = entry.component as { __name?: string; name?: string };
      return `${component.__name ?? component.name ?? 'screen'} #${entry.id} (${entry.mode})`;
    };
    const rows = (record: Record<string, string>) =>
      Object.entries(record)
        .map(([k, v]) => `<div><span class="bl-inspector__key">${escape(k)}</span> ${escape(v)}</div>`)
        .join('') || '<div class="bl-inspector__none">none</div>';
    panel.innerHTML = `
      <div class="bl-inspector__head">UI inspector <small>${escape(key)}</small></div>
      <section><h4>Hovered</h4>${
        info
          ? `<div class="bl-inspector__name" data-component="${escape(info.name)}">${escape(info.path.join(' › '))}</div>
             <h5>props</h5>${rows(info.props)}<h5>state</h5>${rows(info.state)}`
          : '<div class="bl-inspector__none">nothing (point at the UI)</div>'
      }</section>
      <section><h4>Focus</h4><div class="bl-inspector__focus">${
        focused
          ? `${escape(focused.tagName.toLowerCase())}${focused.className ? `.${escape(String(focused.className).split(' ').join('.'))}` : ''} “${escape((focused.textContent ?? '').trim().slice(0, 40))}” in ${escape(screenOf(focused))}`
          : 'none'
      }</div></section>
      <section><h4>Screens</h4>${runtime.ordered
        .map((e) => {
          const c = e.component as { __name?: string; name?: string };
          return `<div>${escape(c.__name ?? c.name ?? 'screen')} #${e.id} · ${e.mode}${e.closing ? ' · closing' : ''}${e.owner ? ` · ${escape(e.owner.name)}` : ' · global'}</div>`;
        })
        .join('') || '<div class="bl-inspector__none">none</div>'}</section>`;
    const target = hovered?.closest('[data-bl-screen] *') as HTMLElement | null;
    if (target) {
      const rect = target.getBoundingClientRect();
      const mount = game.mount.getBoundingClientRect();
      Object.assign(outline.style, {
        left: `${rect.left - mount.left}px`,
        top: `${rect.top - mount.top}px`,
        width: `${rect.width}px`,
        height: `${rect.height}px`,
      });
      outline.hidden = false;
    } else outline.hidden = true;
  };
  const schedule = () => {
    if (!frame) frame = requestAnimationFrame(render);
  };
  const onMove = (event: PointerEvent) => {
    if (panel.hidden) return;
    hovered = document.elementFromPoint(event.clientX, event.clientY);
    if (hovered && panel.contains(hovered)) return;
    schedule();
  };
  const toggle = () => {
    panel.hidden = !panel.hidden;
    outline.hidden = true;
    if (!panel.hidden) render();
  };
  const onKey = (event: KeyboardEvent) => {
    if (event.code === key || event.key === key) {
      event.preventDefault();
      toggle();
    }
  };
  window.addEventListener('keydown', onKey);
  window.addEventListener('pointermove', onMove, { passive: true });
  const offFocus = runtime.ticks.on('step', () => !panel.hidden && schedule());
  return {
    toggle,
    destroy() {
      window.removeEventListener('keydown', onKey);
      window.removeEventListener('pointermove', onMove);
      offFocus();
      panel.remove();
      outline.remove();
    },
  };
}
