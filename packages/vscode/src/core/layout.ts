import { formatJson } from './json';

/** One placed object (same shape as `LayoutObject` in `@blacklight/core`). */
export interface Placement {
  type: string;
  x: number;
  y: number;
  layer?: string;
  angle?: number;
  scale?: number | { x: number; y: number };
  tags?: string[];
  props?: Record<string, unknown>;
}

export interface Layout {
  $schema?: string;
  objects: Placement[];
}

/** Edits the scene editor sends. */
export type LayoutEdit =
  | { op: 'add'; placement: Placement }
  | { op: 'move'; index: number; x: number; y: number }
  | { op: 'update'; index: number; patch: Partial<Placement> }
  | { op: 'remove'; index: number }
  | { op: 'duplicate'; index: number }
  | { op: 'order'; index: number; to: number };

/** Parses a layout file; an empty or new file is an empty layout. */
export function parseLayout(text: string): Layout {
  if (!text.trim()) return { objects: [] };
  const json = JSON.parse(text) as Partial<Layout>;
  if (!json || !Array.isArray(json.objects))
    throw new Error('A layout file needs an "objects" array.');
  return { ...json, objects: json.objects } as Layout;
}

const round = (n: number) => Math.round(n * 100) / 100;

/** Writes a placement with keys in a fixed order and empty fields left out. */
function clean(p: Placement): Placement {
  const out: Placement = { type: p.type, x: round(p.x), y: round(p.y) };
  if (p.layer) out.layer = p.layer;
  if (p.angle) out.angle = round(p.angle);
  if (p.scale !== undefined && p.scale !== 1) out.scale = p.scale;
  if (p.tags?.length) out.tags = p.tags;
  if (p.props && Object.keys(p.props).length) out.props = p.props;
  return out;
}

/** Applies an edit and returns the new layout (the input is not changed). */
export function applyLayoutEdit(layout: Layout, edit: LayoutEdit): Layout {
  const objects = [...layout.objects];
  const check = (index: number) => {
    if (!objects[index]) throw new Error(`No object ${index} in the layout.`);
  };
  switch (edit.op) {
    case 'add':
      objects.push(clean(edit.placement));
      break;
    case 'move':
      check(edit.index);
      objects[edit.index] = clean({ ...objects[edit.index]!, x: edit.x, y: edit.y });
      break;
    case 'update':
      check(edit.index);
      objects[edit.index] = clean({ ...objects[edit.index]!, ...edit.patch });
      break;
    case 'remove':
      check(edit.index);
      objects.splice(edit.index, 1);
      break;
    case 'duplicate':
      check(edit.index);
      objects.splice(
        edit.index + 1,
        0,
        clean({
          ...objects[edit.index]!,
          x: objects[edit.index]!.x + 16,
          y: objects[edit.index]!.y + 16,
        }),
      );
      break;
    case 'order': {
      check(edit.index);
      const [moved] = objects.splice(edit.index, 1);
      objects.splice(Math.max(0, Math.min(objects.length, edit.to)), 0, moved!);
      break;
    }
  }
  return { ...layout, objects };
}

/** Layout file text: `$schema` first, one object per line when it fits. */
export function printLayout(layout: Layout): string {
  const { $schema, objects, ...rest } = layout;
  return formatJson({ ...($schema && { $schema }), ...rest, objects: objects.map(clean) });
}

/** Reads `static layers` and `static size` from a scene source (literal values only). */
export function sceneStatics(source: string): {
  layers: string[];
  size?: { width: number; height: number };
} {
  const layers = /static\s+(?:override\s+)?layers\s*(?::[^=]+)?=\s*\[([^\]]*)\]/.exec(source)?.[1];
  const size =
    /static\s+(?:override\s+)?size\s*(?::[^=]+)?=\s*\{\s*width:\s*(\d+)\s*,\s*height:\s*(\d+)/.exec(
      source,
    );
  return {
    layers: layers ? [...layers.matchAll(/['"]([^'"]+)['"]/g)].map((m) => m[1]!) : ['main'],
    ...(size && { size: { width: Number(size[1]), height: Number(size[2]) } }),
  };
}

/** Width and height of `resolution` in `game.config.ts` (literal values only). */
export function configResolution(source: string): { width: number; height: number } | undefined {
  const match = /resolution\s*:\s*\{[^}]*?width\s*:\s*(\d+)[^}]*?height\s*:\s*(\d+)/.exec(source);
  return match ? { width: Number(match[1]), height: Number(match[2]) } : undefined;
}
