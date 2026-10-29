import type { Game } from '@blacklight/core';

const icons = new Map<string, string>();
const IMAGE_EXTENSIONS = ['svg', 'png', 'webp', 'jpg', 'jpeg', 'gif', 'avif'];

/**
 * Registers an icon for rich text (`<icon=heart>`). Without registration, the name is looked up as
 * an image asset (`assets/icons/heart.svg` is `heart`).
 *
 * @example
 * ```ts
 * defineIcon('coin', coinUrl);
 * ```
 */
export function defineIcon(name: string, url: string): void {
  icons.set(name, url);
}

const warned = new Set<string>();

/** URL of an icon: registered, else the image asset of that name, else an empty image. */
export function iconUrl(name: string, game?: Pick<Game, 'assets'>): string {
  const registered = icons.get(name);
  if (registered) return registered;
  try {
    const path = game?.assets.find(name, { extensions: IMAGE_EXTENSIONS })[0];
    const url = path && game?.assets.url(path);
    if (url) return url;
  } catch {
    // Reported below.
  }
  if (!warned.has(name)) {
    warned.add(name);
    console.warn(
      `[blacklight] Unknown rich-text icon "${name}". Register it with defineIcon('${name}', url) or add assets/icons/${name}.svg.`,
    );
  }
  return 'data:image/gif;base64,R0lGODlhAQABAAAAACw=';
}
