/**
 * DOM → image through SVG `foreignObject` (L1: shaders cannot read DOM pixels, so the component is
 * redrawn as an image that a WebGL texture can hold).
 */

const XHTML = 'http://www.w3.org/1999/xhtml';
const dataUrls = new Map<string, Promise<string>>();

function toDataUrl(url: string): Promise<string> {
  if (url.startsWith('data:')) return Promise.resolve(url);
  let pending = dataUrls.get(url);
  if (!pending) {
    pending = fetch(url)
      .then((response) => response.blob())
      .then(
        (blob) =>
          new Promise<string>((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = () => resolve(String(reader.result));
            reader.onerror = () => reject(reader.error ?? new Error('read failed'));
            reader.readAsDataURL(blob);
          }),
      )
      .catch(() => url);
    dataUrls.set(url, pending);
  }
  return pending;
}

function copyStyles(source: Element, target: Element): void {
  const computed = getComputedStyle(source);
  const style = (target as HTMLElement).style;
  if (!style) return;
  for (let i = 0; i < computed.length; i++) {
    const name = computed.item(i);
    style.setProperty(name, computed.getPropertyValue(name), computed.getPropertyPriority(name));
  }
  const children = source.children;
  const copies = target.children;
  for (let i = 0; i < children.length; i++) {
    const child = children[i]!;
    const copy = copies[i];
    if (copy) copyStyles(child, copy);
  }
}

/**
 * Serializes `element` (with computed styles inlined and images embedded) into an SVG document of
 * its layout size.
 */
export async function snapshotSvg(element: HTMLElement): Promise<{ svg: string; width: number; height: number }> {
  const width = Math.max(1, Math.ceil(element.offsetWidth));
  const height = Math.max(1, Math.ceil(element.offsetHeight));
  const clone = element.cloneNode(true) as HTMLElement;
  copyStyles(element, clone);
  // The live element is drawn invisible (PixiRender hides it); the copy must be visible and unmoved.
  Object.assign(clone.style, {
    opacity: '1',
    visibility: 'visible',
    transform: 'none',
    margin: '0',
    position: 'static',
    width: `${width}px`,
    height: `${height}px`,
  });
  const images = [...clone.querySelectorAll('img')];
  await Promise.all(
    images.map(async (img) => {
      const src = img.getAttribute('src');
      if (src) img.setAttribute('src', await toDataUrl(new URL(src, location.href).href));
    }),
  );
  clone.setAttribute('xmlns', XHTML);
  const body = new XMLSerializer().serializeToString(clone);
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}"><foreignObject x="0" y="0" width="${width}" height="${height}">${body}</foreignObject></svg>`;
  return { svg, width, height };
}

/**
 * Draws `element` into `canvas` at `scale` device pixels per layout pixel.
 *
 * @throws Error when the browser refuses to decode the image (see the PixiRender limits).
 */
export async function drawElement(element: HTMLElement, canvas: HTMLCanvasElement, scale: number): Promise<void> {
  const { svg, width, height } = await snapshotSvg(element);
  const image = new Image();
  image.decoding = 'async';
  image.src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
  await image.decode();
  canvas.width = Math.max(1, Math.round(width * scale));
  canvas.height = Math.max(1, Math.round(height * scale));
  const context = canvas.getContext('2d');
  if (!context) throw new Error('No 2D canvas context available for <PixiRender>.');
  context.clearRect(0, 0, canvas.width, canvas.height);
  context.drawImage(image, 0, 0, canvas.width, canvas.height);
}
