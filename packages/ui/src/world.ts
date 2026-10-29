import { shallowReactive } from 'vue';
import type { Container } from 'pixi.js';
import type { Game, Point, Scene } from '@blacklight/core';

/** Something with a place in a scene: a game object, or a world point of a scene. */
export type WorldTarget = Container | { scene: Scene<never>; x: number; y: number };

/** Where a world target is on the UI, in virtual pixels of the design area. */
export interface UiPosition extends Point {
  /** `false` when the point is outside the visible part of the screen (beyond `margin`). */
  onScreen: boolean;
}

/**
 * Converts a game object (its drawn position, through cameras, layers and hosted scenes) or a
 * world point of a scene into UI coordinates: virtual pixels of the design area, the unit of
 * screen CSS. Points beyond the visible screen by more than `margin` are reported off-screen.
 *
 * @example
 * ```ts
 * const { x, y, onScreen } = worldToUi(game, enemy);
 * ```
 */
export function worldToUi(
  game: Pick<Game, 'world' | 'viewport' | 'config'>,
  target: WorldTarget,
  options: { offset?: Point; margin?: number } = {},
): UiPosition {
  let x: number;
  let y: number;
  if ('scene' in target && !('toGlobal' in target)) {
    const screen = target.scene.camera.toScreen({ x: target.x, y: target.y });
    x = screen.x;
    y = screen.y;
  } else {
    const container = target as Container;
    // Stage coordinates (CSS px of the canvas) → design area, like the world container's transform.
    const global = container.toGlobal({ x: 0, y: 0 });
    const world = game.world;
    x = (global.x - world.position.x) / (world.scale.x || 1);
    y = (global.y - world.position.y) / (world.scale.y || 1);
  }
  x += options.offset?.x ?? 0;
  y += options.offset?.y ?? 0;
  const margin = options.margin ?? 0;
  const visible = visibleArea(game);
  const destroyed = 'destroyed' in target && (target as Container).destroyed;
  const onScreen =
    !destroyed &&
    x >= visible.x - margin &&
    x <= visible.x + visible.width + margin &&
    y >= visible.y - margin &&
    y <= visible.y + visible.height + margin;
  return { x, y, onScreen };
}

/** The part of the design coordinate space the player sees (more than the design area in `extend`). */
export function visibleArea(game: Pick<Game, 'viewport' | 'config'>): {
  x: number;
  y: number;
  width: number;
  height: number;
} {
  const v = game.viewport;
  if (!v) return { x: 0, y: 0, width: game.config.resolution.width, height: game.config.resolution.height };
  return {
    x: -v.originX / v.scale,
    y: -v.originY / v.scale,
    width: v.canvasWidth / v.scale,
    height: v.canvasHeight / v.scale,
  };
}

/** A floating text on screen (damage numbers, "+1", "MISS"). */
export interface FloatingText {
  id: number;
  text: string;
  target: WorldTarget;
  /** Where it was spawned, in world → UI coordinates; it rises from there. */
  x: number;
  y: number;
  color: string;
  size: number;
  /** ms */
  duration: number;
  rise: number;
  className?: string;
}

/** Floating texts currently shown, drawn by the UI root. */
export const floatingTexts: FloatingText[] = shallowReactive([]);
let nextId = 1;

/** Options of {@link floatText}. */
export interface FloatOptions {
  /** CSS color. @defaultValue `'#fff'` */
  color?: string;
  /** Font size in virtual pixels. @defaultValue `40` */
  size?: number;
  /** Lifetime in ms. @defaultValue `900` */
  duration?: number;
  /** Distance risen over the lifetime, virtual pixels. @defaultValue `90` */
  rise?: number;
  /** Offset from the target, virtual pixels. */
  offset?: Point;
  /** Extra CSS class. */
  className?: string;
}

/**
 * Shows a text that rises and fades above a game object or world point (UI-14). It stays attached
 * to the target's position at spawn time, so the camera can move under it.
 *
 * @example
 * ```ts
 * floatText(game, enemy, '-25', { color: '#ff5252' });
 * ```
 */
export function floatText(
  game: Pick<Game, 'world' | 'viewport' | 'config'>,
  target: WorldTarget,
  text: string,
  options: FloatOptions = {},
): void {
  // Anchor on the world point under the target now: numbers do not follow a moving enemy.
  const anchor = anchorPoint(game, target);
  const item: FloatingText = {
    id: nextId++,
    text,
    target: anchor,
    x: options.offset?.x ?? 0,
    y: options.offset?.y ?? 0,
    color: options.color ?? '#fff',
    size: options.size ?? 40,
    duration: options.duration ?? 900,
    rise: options.rise ?? 90,
    className: options.className,
  };
  floatingTexts.push(item);
  setTimeout(() => {
    const index = floatingTexts.indexOf(item);
    if (index >= 0) floatingTexts.splice(index, 1);
  }, item.duration);
}

function anchorPoint(
  game: Pick<Game, 'world' | 'viewport' | 'config'>,
  target: WorldTarget,
): WorldTarget {
  if ('scene' in target && !('toGlobal' in target)) return { ...target };
  const container = target as Container & { scene?: Scene<never> };
  const scene = container.scene;
  if (scene?.camera) {
    const ui = worldToUi(game, container);
    return { scene, ...scene.camera.toWorld(ui) };
  }
  return target;
}

/**
 * A damage number: red, bigger and yellow for critical hits, with a small random spread so
 * successive hits do not overlap.
 *
 * @example
 * ```ts
 * damageNumber(game, enemy, 42, { critical: true });
 * ```
 */
export function damageNumber(
  game: Pick<Game, 'world' | 'viewport' | 'config'>,
  target: WorldTarget,
  amount: number,
  options: FloatOptions & { critical?: boolean; heal?: boolean } = {},
): void {
  const spread = ((nextId * 37) % 41) - 20;
  floatText(game, target, `${options.heal ? '+' : ''}${Math.round(amount)}`, {
    color: options.heal ? '#7CFC8A' : options.critical ? '#ffd60a' : '#ff5252',
    size: options.critical ? 64 : 44,
    className: options.critical ? 'bl-float--critical' : undefined,
    ...options,
    offset: { x: (options.offset?.x ?? 0) + spread, y: options.offset?.y ?? -40 },
  });
}
