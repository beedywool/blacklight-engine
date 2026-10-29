/** What the cursor is typing, from the text before it. */
export type CompletionContext =
  | { kind: 'static'; typedStatic: boolean }
  | { kind: 'animation' }
  | { kind: 'action' }
  | { kind: 'asset' }
  | { kind: 'sound' }
  | { kind: 'scene' }
  | { kind: 'object' }
  | { kind: 'screen' };

/** Which class a file holds. */
export type FileKind = 'scene' | 'object' | 'other';

export function fileKind(path: string): FileKind {
  if (/\.scene\.[cm]?[jt]s$/.test(path)) return 'scene';
  if (/\.object\.[cm]?[jt]s$/.test(path)) return 'object';
  return 'other';
}

const STRING_START = String.raw`\(\s*['"\`]([^'"\`]*)$`;
const CALLS: [RegExp, CompletionContext['kind']][] = [
  [new RegExp(String.raw`\baudio\.(?:play|music)${STRING_START}`), 'sound'],
  [new RegExp(String.raw`\b(?:play|playOnce|isPlaying)${STRING_START}`), 'animation'],
  [new RegExp(String.raw`\b(?:pressed|held|released|rebind|bindings)${STRING_START}`), 'action'],
  [new RegExp(String.raw`\b(?:goto|overlay|hostScene|preload)${STRING_START}`), 'scene'],
  [new RegExp(String.raw`\b(?:spawn|spawnMany|find|findAll|is)${STRING_START}`), 'object'],
  [new RegExp(String.raw`\bui\.(?:push|open|modal|replace)${STRING_START}`), 'screen'],
];

/**
 * Finds what to complete. `before` is the document text up to the cursor; only its end is read.
 */
export function completionContext(before: string, kind: FileKind): CompletionContext | undefined {
  const line = before.slice(before.lastIndexOf('\n') + 1);
  for (const [pattern, what] of CALLS)
    if (pattern.test(line)) return { kind: what } as CompletionContext;
  // Inside `static assets = [ ... '` (the array may span lines).
  const tail = before.slice(-2000);
  const open = tail.search(/static\s+(?:override\s+)?assets\s*(?::[^=]*)?=\s*\[[^\]]*$/);
  if (open >= 0 && /['"`][^'"`]*$/.test(line)) return { kind: 'asset' };
  if (kind !== 'other') {
    const staticMatch = /^\s*(static\s+(?:override\s+)?)?[A-Za-z]*$/.exec(line);
    // Class members sit at one indentation level; the class body is the last `{` still open.
    if (
      staticMatch &&
      (staticMatch[1] || /^ {2}[A-Za-z]*$|^\t[A-Za-z]*$/.test(line)) &&
      insideClassBody(before)
    )
      return { kind: 'static', typedStatic: !!staticMatch[1] };
  }
  return undefined;
}

function insideClassBody(before: string): boolean {
  const classAt = before.search(/class\s+\w+[^{]*\{[^]*$/);
  if (classAt < 0) return false;
  let depth = 0;
  for (const c of before.slice(classAt)) {
    if (c === '{') depth++;
    else if (c === '}') depth--;
  }
  return depth === 1;
}

/** A completion, independent of the editor API. */
export interface Suggestion {
  label: string;
  /** Snippet text (VS Code snippet syntax) when it differs from the label. */
  snippet?: string;
  detail: string;
  documentation?: string;
  kind: 'property' | 'value' | 'file' | 'class' | 'event';
}

/** Static properties the engine reads, by class kind. */
export const STATIC_PROPS: Record<
  'scene' | 'object',
  { name: string; snippet: string; doc: string }[]
> = {
  scene: [
    {
      name: 'assets',
      snippet: "assets = ['${1:./assets/}'];",
      doc: 'Files preloaded before create(), relative to the scene folder; a path ending with / loads a whole folder.',
    },
    {
      name: 'layers',
      snippet: "layers = ['${1:back}', 'main', '${2:front}'];",
      doc: "Draw layers of the world, back to front. 'hud' is always available.",
    },
    {
      name: 'size',
      snippet: 'size = { width: ${1:3840}, height: ${2:2160} };',
      doc: 'World size: camera bounds, onLeave and culling.',
    },
  ],
  object: [
    {
      name: 'animations',
      snippet: 'animations = ${1:anims};',
      doc: 'The imported .anim.json of the object.',
    },
    {
      name: 'behaviors',
      snippet: 'behaviors = [behaviors.${1:eightDirections}({ ${2:speed: 240} })];',
      doc: 'Behaviors attached to every instance.',
    },
    {
      name: 'hitbox',
      snippet:
        "hitbox = { type: 'box' as const, x: ${1:-8}, y: ${2:-8}, width: ${3:16}, height: ${4:16} };",
      doc: "Collision shape: 'auto', 'none', 'pixel', a box, circle or polygon.",
    },
    {
      name: 'collision',
      snippet: "collision = { layer: '${1:player}', mask: [${2}], solid: ${3:false} };",
      doc: 'Collision layer, mask and solidity.',
    },
    { name: 'tags', snippet: "tags = ['${1:enemy}'];", doc: 'Tags tested by is() and find().' },
    {
      name: 'assets',
      snippet: "assets = ['${1:./}'];",
      doc: 'Extra files preloaded with the object, relative to its folder.',
    },
    {
      name: 'serialize',
      snippet: "serialize = ['${1:hp}'];",
      doc: 'Fields saved in snapshots; every data field by default.',
    },
    {
      name: 'texture',
      snippet: "texture = '${1:./sprite.png}';",
      doc: 'Image shown by a Sprite without animations.',
    },
  ],
};

/** Data the completion needs from the project. */
export interface CompletionData {
  animations: string[];
  actions: string[];
  scenes: string[];
  objects: string[];
  screens: string[];
  /** Asset references offered in `static assets`, already relative to the file (`./assets/x.png`, `@assets/y.ogg`). */
  assetRefs: string[];
  /** Short keys of audio files (`coin`). */
  sounds: string[];
}

/** The suggestions for a context. */
export function suggestions(
  context: CompletionContext,
  kind: FileKind,
  data: CompletionData,
): Suggestion[] {
  switch (context.kind) {
    case 'static': {
      if (kind === 'other') return [];
      const prefix = context.typedStatic ? '' : 'static override ';
      return STATIC_PROPS[kind].map((p) => ({
        label: context.typedStatic ? p.name : `static ${p.name}`,
        snippet: `${prefix}${p.snippet}`,
        detail: `Blacklight ${kind} static property`,
        documentation: p.doc,
        kind: 'property',
      }));
    }
    case 'animation':
      return data.animations.map((label) => ({ label, detail: 'animation', kind: 'event' }));
    case 'action':
      return data.actions.map((label) => ({ label, detail: 'input action', kind: 'value' }));
    case 'scene':
      return data.scenes.map((label) => ({ label, detail: 'scene', kind: 'class' }));
    case 'object':
      return data.objects.map((label) => ({ label, detail: 'object', kind: 'class' }));
    case 'screen':
      return data.screens.map((label) => ({ label, detail: 'UI screen', kind: 'class' }));
    case 'asset':
      return data.assetRefs.map((label) => ({ label, detail: 'asset', kind: 'file' }));
    case 'sound':
      return data.sounds.map((label) => ({ label, detail: 'sound', kind: 'file' }));
  }
}

const ALIAS_DIRS = ['assets', 'objects', 'models', 'stories', 'ui', 'modules'];

/**
 * How a file refers to an asset, like the runtime resolves it: `./…` inside the file's folder,
 * an alias (`@assets/…`, `@objects/…`) for aliased folders, `/…` from the project root otherwise.
 */
export function assetRef(asset: string, fileDir: string): string {
  if (asset.startsWith(`${fileDir}/`)) return `./${asset.slice(fileDir.length + 1)}`;
  const top = asset.slice(0, asset.indexOf('/'));
  if (ALIAS_DIRS.includes(top)) return `@${asset}`;
  return `/${asset}`;
}
