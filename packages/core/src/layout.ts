import type { Point } from './math';
import type { GameObject } from './objects/game-object';
import type { ObjectName } from './register';
import type { Scene } from './scene';

/** One object placed in a layout file. */
export interface LayoutObject {
  /** Object name (PascalCase folder name). */
  type: ObjectName | (string & {});
  x: number;
  y: number;
  /** Scene layer; the scene's default layer when omitted. */
  layer?: string;
  /** Rotation in degrees. */
  angle?: number;
  /** Uniform scale or per axis. */
  scale?: number | Point;
  /** Tags added to the object (`scene.find('door-1')`). */
  tags?: string[];
  /** Other public fields, set before `create()` like `spawn` props. */
  props?: Record<string, unknown>;
}

/**
 * Content of `scenes/<name>/<name>.layout.json`, written by the VS Code scene editor (JSON
 * Schema: `@blacklight/core/schema/layout.schema.json`).
 *
 * @example
 * ```json
 * { "objects": [{ "type": "Coin", "x": 120, "y": 100 }, { "type": "Door", "x": 300, "y": 80, "tags": ["exit"] }] }
 * ```
 */
export interface SceneLayout {
  $schema?: string;
  objects: LayoutObject[];
}

/** Spawns the objects of a layout in order; see {@link Scene.load}. */
export function loadLayout(scene: Scene<never>, layout: SceneLayout): GameObject[] {
  if (!layout || !Array.isArray(layout.objects)) {
    throw new Error(
      `scene.load() expects the content of a .layout.json file ({ "objects": [...] }); got ${JSON.stringify(layout)?.slice(0, 80)}. Import it with \`import layout from './${scene.name}.layout.json'\`.`,
    );
  }
  return layout.objects.map((placed, index) => {
    if (
      typeof placed.type !== 'string' ||
      typeof placed.x !== 'number' ||
      typeof placed.y !== 'number'
    ) {
      throw new Error(
        `Layout object ${index} needs "type" (an object name), "x" and "y"; got ${JSON.stringify(placed)}.`,
      );
    }
    const props: Record<string, unknown> = {
      ...placed.props,
      x: placed.x,
      y: placed.y,
      ...(placed.layer !== undefined && { layer: placed.layer }),
      ...(placed.angle !== undefined && { angle: placed.angle }),
      ...(placed.scale !== undefined && { scale: placed.scale }),
    };
    // `spawn` types props per class; a layout is data, checked by its schema instead.
    const object = scene.spawn(placed.type as ObjectName, props as never);
    for (const tag of placed.tags ?? []) object.tags.add(tag);
    return object;
  });
}
