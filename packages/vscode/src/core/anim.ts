import {
  gridSheet,
  isAsepriteJson,
  parseAseprite,
  parseGridName,
  resolveAnimations,
  type AnimationFile,
  type Sheet,
} from './engine';
import { formatJson } from './json';
import { extension, IMAGE_EXTENSIONS } from './project';

/** What the animation preview draws for one animation. */
export interface PreviewAnimation {
  name: string;
  /** Frame rectangles in the sheet image, in play order. */
  frames: { x: number; y: number; width: number; height: number }[];
  /** Duration of each frame in ms. */
  durations: number[];
  loop: boolean;
  next?: string;
  /** Events by step index. */
  events: Record<number, string[]>;
}

/** Everything the preview needs, or the reason it cannot show the file. */
export interface AnimPreview {
  /** Sheet image, relative to the object folder. */
  image?: string;
  animations: PreviewAnimation[];
  default?: string;
  error?: string;
}

/** File access for {@link animPreview}, relative to the object folder. */
export interface AnimSources {
  /** Folder name (`hero` for `objects/hero`). */
  folder: string;
  /** Files of the folder. */
  files: string[];
  imageSize(file: string): { width: number; height: number } | undefined;
  readJson(file: string): unknown;
}

const strip = (path: string) => path.replace(/^\.\//, '');

/** Finds the sheet like the runtime (source, Aseprite JSON, `<folder>.png` or `<folder>@WxH.png`). */
function findSheet(
  file: AnimationFile,
  io: AnimSources,
): { image?: string; sheet?: Sheet; error?: string } {
  let source = file.source ? strip(file.source) : undefined;
  if (!source) {
    source =
      io.files.find((f) => f === `${io.folder}.aseprite.json` || f === `${io.folder}.json`) ??
      io.files.find(
        (f) =>
          IMAGE_EXTENSIONS.has(extension(f)) &&
          (f.startsWith(`${io.folder}.`) || f.startsWith(`${io.folder}@`)),
      );
  } else if (!io.files.includes(source)) {
    const variant = io.files.find((f) => f.slice(0, f.lastIndexOf('.')) === source);
    if (!variant)
      return { error: `"source" points to ${file.source}, which is not in this folder.` };
    source = variant;
  }
  if (!source)
    return { error: `No sheet found: add "source" or a ${io.folder}.png next to the file.` };
  if (extension(source) === 'json') {
    const json = io.readJson(source);
    if (!isAsepriteJson(json)) return { error: `${source} is not an Aseprite JSON export.` };
    const sheet = parseAseprite(json);
    return { image: sheet.image ? strip(sheet.image) : undefined, sheet };
  }
  const size = io.imageSize(source);
  if (!size) return { image: source, error: `Cannot read the size of ${source}.` };
  const grid = parseGridName(source);
  const sheet = grid
    ? gridSheet(grid, size.width, size.height)
    : { frames: [{ rect: { x: 0, y: 0, ...size } }], tags: [], slices: [] };
  return { image: source, sheet };
}

/** Resolves an `.anim.json` text into frames to draw, the same way the runtime plays it. */
export function animPreview(text: string, io: AnimSources): AnimPreview {
  let file: AnimationFile;
  try {
    file = JSON.parse(text) as AnimationFile;
  } catch (error) {
    return { animations: [], error: `Invalid JSON: ${(error as Error).message}` };
  }
  if (!file || typeof file.animations !== 'object')
    return { animations: [], error: 'The file needs an "animations" object.' };
  const { image, sheet, error } = findSheet(file, io);
  if (!sheet) return { image, animations: [], error };
  try {
    const resolved = resolveAnimations(file, sheet);
    return {
      image,
      default: file.default ?? Object.keys(file.animations)[0],
      animations: [...resolved.values()].map((a) => ({
        name: a.name,
        frames: a.frames.map((i) => sheet.frames[i]?.rect ?? { x: 0, y: 0, width: 0, height: 0 }),
        durations: a.durations,
        loop: a.loop,
        ...(a.next && { next: a.next }),
        events: Object.fromEntries(a.events),
      })),
    };
  } catch (error) {
    return { image, animations: [], error: (error as Error).message };
  }
}

/** Sets one field of one animation in the file text (or the file-level field when `animation` is empty). */
export function setAnimField(
  text: string,
  animation: string | undefined,
  key: string,
  value: unknown,
): string {
  const file = JSON.parse(text) as AnimationFile & Record<string, unknown>;
  const target = animation
    ? ((file.animations[animation] ??= {}) as Record<string, unknown>)
    : (file as Record<string, unknown>);
  if (value === undefined || value === '') delete target[key];
  else target[key] = value;
  return formatJson(file);
}

/** Renames, adds or removes an animation. */
export function editAnimations(
  text: string,
  edit: { add?: string; remove?: string; rename?: { from: string; to: string } },
): string {
  const file = JSON.parse(text) as AnimationFile;
  const entries = Object.entries(file.animations);
  let next = entries;
  if (edit.add && !file.animations[edit.add]) next = [...entries, [edit.add, { frames: [0] }]];
  if (edit.remove) next = next.filter(([name]) => name !== edit.remove);
  if (edit.rename)
    next = next.map(([name, def]) => [name === edit.rename!.from ? edit.rename!.to : name, def]);
  file.animations = Object.fromEntries(next);
  if (edit.remove && file.default === edit.remove) delete file.default;
  if (edit.rename && file.default === edit.rename.from) file.default = edit.rename.to;
  return formatJson(file);
}
