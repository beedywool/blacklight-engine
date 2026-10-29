// `@blacklight/core/debug`: the dev overlay. The generated entry imports it only in dev builds,
// so release builds do not contain it.
import { Graphics as PixiGraphics } from 'pixi.js';
import type { Game } from '../game';
import type { GameObject } from '../objects/game-object';
import type { WorldShape } from '../collision/shapes';
import type { Point } from '../math';

const HELP = 'F3 overlay · F4 hitboxes · F6 pause · F7 step · F8 slow motion';

/**
 * Installs the debug overlay: frame rate, steps, scene, object counts, last sounds, input device;
 * hitboxes; pause, step-by-step and slow motion.
 *
 * @returns A function that removes it.
 */
export function installDebug(game: Game): () => void {
  const panel = document.createElement('pre');
  panel.style.cssText =
    'position:fixed;left:8px;top:8px;margin:0;padding:10px 12px;z-index:99999;pointer-events:none;' +
    'font:12px/1.45 ui-monospace,SFMono-Regular,Menlo,monospace;color:#ededed;background:rgba(8,8,8,.82);' +
    'border:1px solid #3a3a3a;border-radius:8px;white-space:pre;display:none';
  document.body.append(panel);
  const hitboxes = new PixiGraphics();
  game.app.stage.addChild(hitboxes);
  let visible = false;
  let showHitboxes = false;
  let slow = false;

  const onKey = (event: KeyboardEvent) => {
    switch (event.code) {
      case 'F3':
        visible = !visible;
        panel.style.display = visible ? 'block' : 'none';
        break;
      case 'F4':
        showHitboxes = !showHitboxes;
        break;
      case 'F6':
        if (game.paused) game.resume();
        else game.pause();
        break;
      case 'F7':
        if (!game.paused) game.pause();
        game.step(1);
        break;
      case 'F8':
        slow = !slow;
        game.time.scale = slow ? 0.25 : 1;
        break;
      default:
        return;
    }
    event.preventDefault();
  };
  window.addEventListener('keydown', onKey);

  const update = () => {
    const scene = game.scene;
    hitboxes.clear();
    if (showHitboxes && scene) {
      hitboxes.position.copyFrom(game.world.position);
      hitboxes.scale.copyFrom(game.world.scale);
      for (const object of scene.objects) drawShape(hitboxes, object, (p) => toScreen(object, p));
    }
    if (!visible) return;
    const counts = new Map<string, number>();
    for (const object of scene?.objects ?? [])
      counts.set(object.objectName, (counts.get(object.objectName) ?? 0) + 1);
    const top = [...counts].sort((a, b) => b[1] - a[1]).slice(0, 12);
    panel.textContent = [
      `${Math.round(game.app.ticker.FPS)} fps · step ${game.time.step}${game.paused ? ' · PAUSED' : ''}${slow ? ' · ×0.25' : ''}`,
      `scene ${scene?.name ?? '—'}${game.overlays.length ? ` + ${game.overlays.map((o) => o.scene.name).join(', ')}` : ''}`,
      `${scene?.objects.length ?? 0} objects · ${scene?.tweens.size ?? 0} tweens`,
      ...top.map(([name, count]) => `  ${name} ×${count}`),
      `input ${game.input.lastDevice} · players ${game.input.joinedPlayers.length} · pads ${game.input.gamepads.length}`,
      `sounds ${game.audio.history.slice(-4).join(', ') || '—'}`,
      HELP,
    ].join('\n');
  };
  game.app.ticker.add(update);
  console.info(`[blacklight] Debug overlay: ${HELP}`);

  return () => {
    window.removeEventListener('keydown', onKey);
    game.app.ticker.remove(update);
    panel.remove();
    hitboxes.destroy();
  };
}

/** Scene point → design-area point, through the camera unless the object is in the HUD. */
function toScreen(object: GameObject, point: Point): Point {
  for (let node = object.parent; node; node = node.parent)
    if (node === object.scene.hud) return point;
  return object.scene.camera.toScreen(point);
}

function drawShape(g: PixiGraphics, object: GameObject, map: (p: Point) => Point): void {
  const shape: WorldShape | undefined = object.worldShape();
  if (!shape) return;
  const color = object.collision.solid
    ? 0xff8a65
    : object.contacts.length > 0
      ? 0xffd60a
      : 0x5fd39a;
  const stroke = { color, width: 1.5, alpha: 0.9 };
  switch (shape.kind) {
    case 'box':
    case 'pixel': {
      const r = shape.rect;
      const corners = [
        { x: r.x, y: r.y },
        { x: r.x + r.width, y: r.y },
        { x: r.x + r.width, y: r.y + r.height },
        { x: r.x, y: r.y + r.height },
      ];
      g.poly(corners.map(map).flatMap((p) => [p.x, p.y])).stroke(stroke);
      break;
    }
    case 'circle': {
      const c = map(shape);
      const edge = map({ x: shape.x + shape.radius, y: shape.y });
      g.circle(c.x, c.y, Math.hypot(edge.x - c.x, edge.y - c.y)).stroke(stroke);
      break;
    }
    case 'polygon':
      g.poly(shape.points.map(map).flatMap((p) => [p.x, p.y])).stroke(stroke);
      break;
  }
}
