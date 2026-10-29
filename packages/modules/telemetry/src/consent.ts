/** Texts of the consent question. */
export interface ConsentTexts {
  title: string;
  message: string;
  /** Label of the button that grants consent. */
  allow: string;
  /** Label of the button that refuses. */
  deny: string;
}

/** English defaults of {@link ConsentTexts}. */
export const DEFAULT_CONSENT_TEXTS: ConsentTexts = {
  title: 'Help improve the game?',
  message:
    'Send anonymous crash reports and usage statistics to the developers. No name, e-mail or address is sent. You can change this later in the settings.',
  allow: 'Send reports',
  deny: 'No thanks',
};

/**
 * A minimal consent dialog for games without a UI layer: a modal box over `mount` with two
 * buttons, focus on "allow", Enter to accept and Escape to refuse. Resolves with the choice and
 * removes itself.
 *
 * @example
 * ```ts
 * const granted = await consentDialog(game.mount, DEFAULT_CONSENT_TEXTS);
 * await game.modules.telemetry.setConsent(granted);
 * ```
 */
export function consentDialog(mount: HTMLElement, texts: ConsentTexts): Promise<boolean> {
  const doc = mount.ownerDocument;
  return new Promise((resolve) => {
    const backdrop = doc.createElement('div');
    backdrop.style.cssText =
      'position:absolute;inset:0;display:grid;place-items:center;background:rgba(0,0,0,.6);z-index:2147483000;font:16px/1.5 system-ui,sans-serif';
    const box = doc.createElement('div');
    box.setAttribute('role', 'dialog');
    box.setAttribute('aria-modal', 'true');
    box.setAttribute('aria-labelledby', 'bl-consent-title');
    box.setAttribute('aria-describedby', 'bl-consent-message');
    box.style.cssText =
      'max-width:min(480px,calc(100% - 32px));padding:24px;border-radius:28px;background:#1e1e1e;color:#fff;box-shadow:0 8px 32px rgba(0,0,0,.5)';
    const title = doc.createElement('h2');
    title.id = 'bl-consent-title';
    title.textContent = texts.title;
    title.style.cssText = 'margin:0 0 8px;font-size:20px';
    const message = doc.createElement('p');
    message.id = 'bl-consent-message';
    message.textContent = texts.message;
    message.style.cssText = 'margin:0 0 20px;color:#c4c4c4';
    const row = doc.createElement('div');
    row.style.cssText = 'display:flex;gap:8px;justify-content:flex-end;flex-wrap:wrap';
    const button = (label: string, primary: boolean) => {
      const element = doc.createElement('button');
      element.type = 'button';
      element.textContent = label;
      element.style.cssText = `padding:10px 20px;border-radius:20px;border:0;font:inherit;font-weight:600;cursor:pointer;${
        primary ? 'background:#fff;color:#080808' : 'background:#3a3a3a;color:#fff'
      }`;
      return element;
    };
    const allow = button(texts.allow, true);
    const deny = button(texts.deny, false);
    row.append(deny, allow);
    box.append(title, message, row);
    backdrop.append(box);

    const finish = (granted: boolean) => {
      backdrop.removeEventListener('keydown', onKey);
      backdrop.remove();
      resolve(granted);
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') finish(false);
      else if (event.key === 'Enter' && event.target !== deny) finish(true);
      else return;
      event.preventDefault();
      event.stopPropagation();
    };
    allow.addEventListener('click', () => finish(true));
    deny.addEventListener('click', () => finish(false));
    backdrop.addEventListener('keydown', onKey);
    // The game's canvas must not move under the dialog; the mount is the positioned container.
    if (doc.defaultView?.getComputedStyle(mount).position === 'static') {
      mount.style.position = 'relative';
    }
    mount.append(backdrop);
    allow.focus();
  });
}
