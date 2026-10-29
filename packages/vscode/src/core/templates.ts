import { pascalCase } from './project';

/** Folder names the engine accepts: lowercase words joined by dashes (`big-enemy`). */
export const NAME_PATTERN = /^[a-z][a-z0-9]*(?:-[a-z0-9]+)*$/;

/** Turns what was typed (`Big Enemy`, `bigEnemy`) into a folder name (`big-enemy`). */
export function toFolderName(input: string): string {
  return input
    .trim()
    .replace(/([a-z0-9])([A-Z])/g, '$1-$2')
    .replace(/[^A-Za-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .toLowerCase();
}

/** `undefined` when valid, else what is wrong and how to fix it. */
export function validateName(input: string, existing: string[] = []): string | undefined {
  const name = toFolderName(input);
  if (!name) return 'Type a name, for example "battle" or "big-enemy".';
  if (!NAME_PATTERN.test(name))
    return `"${name}" must start with a letter; use letters, digits and dashes.`;
  if (existing.includes(name)) return `"${name}" already exists; choose another name.`;
  return undefined;
}

/** Kinds of object the "New Object" command creates. */
export type ObjectKind = 'sprite' | 'animated' | 'shape';

/** Files of a new scene, relative to the game folder. */
export function sceneFiles(folder: string): Record<string, string> {
  const name = pascalCase(folder);
  return {
    [`scenes/${folder}/${folder}.scene.ts`]: `import { Scene } from '@blacklight/core';

export default class ${name} extends Scene {
  override create() {
    // Spawn objects here: this.spawn('Player', { x: 160, y: 90 });
  }

  override update() {
    // Runs every fixed step (60 per second by default).
  }
}
`,
    [`scenes/${folder}/assets/.gitkeep`]: '',
  };
}

/** Files of a new object; `base` is `objects` or `scenes/<scene>/objects`. */
export function objectFiles(
  folder: string,
  kind: ObjectKind,
  base = 'objects',
): Record<string, string> {
  const name = pascalCase(folder);
  const dir = `${base}/${folder}`;
  const depth = dir.split('/').length;
  const schema = `${'../'.repeat(depth)}node_modules/@blacklight/core/schema/anim.schema.json`;
  if (kind === 'shape') {
    return {
      [`${dir}/${folder}.object.ts`]: `import { Graphics } from '@blacklight/core';

export default class ${name} extends Graphics {
  static override hitbox = { type: 'box' as const, x: -8, y: -8, width: 16, height: 16 };

  override create() {
    this.draw.rect(-8, -8, 16, 16).fill(0xffffff);
  }

  override update() {}
}
`,
    };
  }
  if (kind === 'sprite') {
    return {
      [`${dir}/${folder}.object.ts`]: `import { Sprite } from '@blacklight/core';

// Shows ${folder}.png from this folder.
export default class ${name} extends Sprite {
  override update() {}
}
`,
    };
  }
  return {
    [`${dir}/${folder}.object.ts`]: `import { Sprite } from '@blacklight/core';
import anims from './${folder}.anim.json';

export default class ${name} extends Sprite {
  static override animations = anims;

  override update() {
    this.play(this.velocity.length > 0 ? 'run' : 'idle');
  }
}
`,
    [`${dir}/${folder}.anim.json`]: `${JSON.stringify(
      {
        $schema: schema,
        source: `./${folder}@32x32.png`,
        default: 'idle',
        animations: { idle: { frames: [0], fps: 4 }, run: { frames: [0], fps: 10 } },
      },
      null,
      2,
    )}\n`,
  };
}

/** A new, empty layout file for a scene. */
export function layoutFile(): string {
  return `{\n  "$schema": "../../node_modules/@blacklight/core/schema/layout.schema.json",\n  "objects": []\n}\n`;
}

/** A new timeline file. */
export function timelineFile(depth: number): string {
  return `{\n  "$schema": "${'../'.repeat(depth)}node_modules/@blacklight/core/schema/timeline.schema.json",\n  "steps": [\n    { "to": ".title", "keyframes": { "opacity": [0, 1] }, "duration": 0.3 }\n  ]\n}\n`;
}
