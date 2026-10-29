/**
 * Names known in the current game. The CLI generates `.blacklight/types.d.ts`, which fills this
 * interface from the project (scene folders, object folders, input actions, animation names, asset
 * files), so a typo in `goto('batle')` or `pressed('jupm')` is a type error.
 *
 * @example
 * ```ts
 * // .blacklight/types.d.ts (generated)
 * declare module '@blacklight/core' {
 *   interface Register {
 *     scenes: 'title' | 'battle';
 *     actions: 'left' | 'right' | 'jump';
 *   }
 * }
 * ```
 */
// eslint-disable-next-line @typescript-eslint/no-empty-object-type
export interface Register {}

type Registered<K extends string, Fallback> = Register extends { [P in K]: infer T } ? T : Fallback;

/** A scene name of this game. */
export type SceneName = Registered<'scenes', string>;
/** A registered object name (PascalCase folder name under `objects/` or `scenes/<s>/objects/`). */
export type ObjectName = Registered<'objects', string>;
/** An input action from `game.config.ts`. */
export type ActionName = Registered<'actions', string>;
/** An animation name; any string is accepted, known names are suggested. */
export type AnimationName = Registered<'animations', never> | (string & {});
/** An asset key or path; any string is accepted, known ones are suggested. */
export type AssetKey = Registered<'assets', never> | (string & {});
