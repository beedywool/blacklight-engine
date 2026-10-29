// Shared helpers of the extension's pages: messaging with the extension and a small DOM builder.

interface VsCodeApi {
  postMessage(message: unknown): void;
  getState(): unknown;
  setState(state: unknown): void;
}

declare function acquireVsCodeApi(): VsCodeApi;

const api: VsCodeApi =
  typeof acquireVsCodeApi === 'function'
    ? acquireVsCodeApi()
    : { postMessage: () => {}, getState: () => undefined, setState: () => {} };

/** Sends a message to the extension. */
export function send(type: string, data: Record<string, unknown> = {}): void {
  api.postMessage({ type, ...data });
}

/** Saved UI state of the page (selection, zoom), kept while the tab is hidden. */
export function memory<T extends object>(defaults: T): T {
  const saved = (api.getState() as Partial<T> | undefined) ?? {};
  const state = { ...defaults, ...saved };
  return new Proxy(state, {
    set(target, key, value) {
      (target as Record<string | symbol, unknown>)[key] = value;
      api.setState(target);
      return true;
    },
  });
}

type Child = Node | string | number | false | null | undefined | Child[];
type Attrs = Record<string, unknown> & { class?: string; style?: string };

/** Creates an element: `h('button', { class: 'primary', onclick }, 'Save')`. */
export function h<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  attrs: Attrs = {},
  ...children: Child[]
): HTMLElementTagNameMap[K] {
  const element = document.createElement(tag);
  for (const [key, value] of Object.entries(attrs)) {
    if (value === undefined || value === null || value === false) continue;
    if (key.startsWith('on') && typeof value === 'function')
      element.addEventListener(key.slice(2), value as EventListener);
    else if (key === 'value' && 'value' in element)
      (element as HTMLInputElement).value = String(value);
    else if (key === 'checked') (element as HTMLInputElement).checked = !!value;
    else element.setAttribute(key, value === true ? '' : String(value));
  }
  append(element, children);
  return element;
}

function append(parent: Node, children: Child[]): void {
  for (const child of children) {
    if (child === undefined || child === null || child === false) continue;
    if (Array.isArray(child)) append(parent, child);
    else
      parent.appendChild(
        typeof child === 'object' ? child : document.createTextNode(String(child)),
      );
  }
}

/** Replaces the page content, keeping the focused field when it still exists. */
export function render(...children: Child[]): void {
  const app = document.getElementById('app')!;
  const focused = document.activeElement as HTMLElement | null;
  const key = focused?.dataset.key;
  const selection =
    focused instanceof HTMLInputElement
      ? [focused.selectionStart, focused.selectionEnd]
      : undefined;
  app.replaceChildren();
  append(app, children);
  if (key) {
    const again = app.querySelector<HTMLElement>(`[data-key="${CSS.escape(key)}"]`);
    again?.focus();
    if (again instanceof HTMLInputElement && selection && again.type === 'text')
      again.setSelectionRange(selection[0] ?? null, selection[1] ?? null);
  }
}

let errorBox: HTMLElement | undefined;

/** Shows an error from the extension at the bottom of the page. */
function showError(message: string): void {
  errorBox?.remove();
  errorBox = h('div', { class: 'error-toast', role: 'alert' }, message);
  document.body.append(errorBox);
  setTimeout(() => errorBox?.remove(), 6000);
}

/** Calls `onState` with every state the extension sends, then says the page is ready. */
export function connect<S>(
  onState: (state: S) => void,
  onResult?: (result: unknown) => void,
): void {
  window.addEventListener(
    'message',
    (event: MessageEvent<{ type: string; state?: S; message?: string; result?: unknown }>) => {
      const message = event.data;
      if (message.type === 'state') onState(message.state as S);
      else if (message.type === 'error') showError(message.message ?? 'Error');
      else if (message.type === 'result') onResult?.(message.result);
    },
  );
  send('ready');
}

/** A labelled field row. */
export function field(label: string, control: Node, hint?: string): HTMLElement {
  return h(
    'label',
    { class: 'field' },
    h('span', { class: 'field__label' }, label),
    control,
    hint && h('span', { class: 'field__hint' }, hint),
  );
}

/** Number input that reports changes (on change, not on every key). */
export function numberInput(
  key: string,
  value: number | undefined,
  onChange: (value: number | undefined) => void,
  attrs: Attrs = {},
): HTMLInputElement {
  return h('input', {
    type: 'number',
    'data-key': key,
    value: value ?? '',
    ...attrs,
    onchange: (event: Event) => {
      const text = (event.target as HTMLInputElement).value;
      onChange(text === '' ? undefined : Number(text));
    },
  });
}

/** Text input that reports changes. */
export function textInput(
  key: string,
  value: string | undefined,
  onChange: (value: string) => void,
  attrs: Attrs = {},
): HTMLInputElement {
  return h('input', {
    type: 'text',
    'data-key': key,
    value: value ?? '',
    ...attrs,
    onchange: (event: Event) => onChange((event.target as HTMLInputElement).value),
  });
}

/** Loads an image once per URL. */
const images = new Map<string, HTMLImageElement>();
export function image(url: string, onLoad?: () => void): HTMLImageElement {
  let img = images.get(url);
  if (!img) {
    img = new Image();
    img.src = url;
    images.set(url, img);
  }
  if (onLoad) {
    if (img.complete && img.naturalWidth) onLoad();
    else img.addEventListener('load', onLoad, { once: true });
  }
  return img;
}

export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(2)} MB`;
}
