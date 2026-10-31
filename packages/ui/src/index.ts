import type { t as translate } from './i18n';
import './styles.css';
import './styles-extra.css';

export {
  ui,
  uiOf,
  UiRuntime,
  UiStack,
  type ScreenEntry,
  type ScreenHandle,
  type ScreenOptions,
  type ScreenRef,
  type UiOptions,
} from './runtime';
export {
  onUiStep,
  useFocus,
  useGame,
  useInputDevice,
  useScreen,
  useTimeline,
  useFx,
  useUi,
  useUiRuntime,
  type UseScreenOptions,
} from './composables';
export { vFocus } from './directives';
export {
  FocusManager,
  AUTOFOCUS_ATTR,
  FOCUSED_ATTR,
  FOCUS_ATTR,
  GROUP_ATTR,
  type FocusSound,
  type NavigateDetail,
} from './focus';
export { directionOf, pickNext, wrapTarget, type Box, type Direction } from './spatial';
export { Timeline, type StepOptions, type StopMode } from './timeline';
export {
  applyTimeline,
  type TimelineJson,
  type TimelineLabelStep,
  type TimelineSoundStep,
  type TimelineStep,
  type TimelineToStep,
} from './timeline-json';
export {
  coverTransition,
  defineTransition,
  effectNames,
  getEffect,
  getTransition,
  playEffect,
  transitionNames,
  type EffectFrame,
  type ScreenTransition,
  type TransitionEffect,
} from './transitions';
export {
  ACCESSIBILITY_DEFAULTS,
  accessibility,
  colorFilterMatrix,
  prefersReducedMotion,
  type AccessibilitySettings,
  type ColorFilter,
} from './a11y';
export {
  I18n,
  isCjk,
  lineBreaks,
  t,
  textDirection,
  useI18n,
  type MessageValues,
  type Messages,
  type PluralForms,
} from './i18n';
export { BUILTIN_MESSAGES } from './messages';
export {
  colorValue,
  graphemes,
  parseRichText,
  plainText,
  revealSchedule,
  sizeValue,
  visibleCount,
  type RichNode,
  type RunStyle,
} from './richtext';
export { defineIcon, iconUrl } from './icons';
export {
  Dialogue,
  lineLength,
  parseTag,
  type BacklogEntry,
  type DialogueChoice,
  type DialogueEvents,
  type DialogueLine,
  type DialogueOptions,
  type DialogueState,
  type DialogueTag,
  type InkStory,
  type Portrait,
} from './dialogue';
export { createFxFilter, FX_SHADERS, type FxFilter, type FxName } from './fx/filters';
export {
  FxLayer,
  type FxHandle,
  type FxOptions,
  type FxOverlay,
  type FxTarget,
} from './fx/fx-layer';
export { drawElement, snapshotSvg } from './fx/snapshot';
export {
  damageNumber,
  floatText,
  floatingTexts,
  visibleArea,
  worldToUi,
  type FloatOptions,
  type FloatingText,
  type UiPosition,
  type WorldTarget,
} from './world';
export { onAfterDraw } from './frame';
export {
  cueAt,
  loadSubtitles,
  parseVtt,
  playCutscene,
  subtitle,
  subtitleLines,
  videoSources,
  type CutsceneOptions,
  type SubtitleCue,
  type SubtitleLine,
} from './video';
export {
  captureThumbnail,
  fileSlots,
  type FileSlotsOptions,
  type SaveSlotInfo,
  type SaveSlotMeta,
  type SaveSlots,
} from './slots';
export {
  activeTheme,
  blacklightTheme,
  defineTheme,
  getTheme,
  personaTheme,
  themeNames,
  themeVariables,
  type Theme,
} from './theme';
export {
  bindingForDevice,
  glyphFor,
  kenneyPack,
  padFamily,
  setPromptPack,
  type Glyph,
  type PadFamily,
  type PromptPack,
} from './prompts';
export { toast, toasts, useToast, type Toast } from './widgets/toast';

// Components
/**
 * Pins its content to a point of the safe area (corners, edges, center) with an offset in virtual
 * pixels, following the player's UI scale. Use it for HUD elements that must stay clear of notches
 * and reach the real screen edges in `extend` mode.
 *
 * @example
 * ```vue
 * <Anchor to="top-left" :offset="[32, 24]">
 *   <Counter :value="coins" />
 * </Anchor>
 * ```
 */
export { default as Anchor } from './components/Anchor.vue';
/**
 * A focus group: directions move between its focusable children first, with optional wrapping
 * (`wrap`), trapping (`trap`) and a single axis (`axis`). Focus returns to the last focused child
 * when the group is entered again.
 *
 * @example
 * ```vue
 * <FocusGroup wrap axis="x">
 *   <Button v-for="card in cards" :key="card.id" @click="pick(card)">{{ card.name }}</Button>
 * </FocusGroup>
 * ```
 */
export { default as FocusGroup } from './components/FocusGroup.vue';
/**
 * The button glyph of an action for the device the player last used (keyboard key, Xbox,
 * PlayStation or Switch button, mouse, touch), updated live when the player switches devices or
 * rebinds the action. `device` forces one device; `label` adds text after the glyph.
 *
 * @example
 * ```vue
 * <InputPrompt action="confirm" label="SELECT" :size="44" />
 * ```
 */
export { default as InputPrompt } from './components/InputPrompt.vue';
/**
 * Reveals its content with a clip-path shape (`wipe-right`, `circle`, `slash`…) at `progress` from
 * 0 (hidden) to 1 (shown). Animate `progress` yourself, or give a `duration` for a CSS transition.
 *
 * @example
 * ```vue
 * <Mask shape="slash" :progress="open ? 1 : 0" :duration="300">
 *   <img :src="portrait" alt="" />
 * </Mask>
 * ```
 */
export { default as Mask } from './components/Mask.vue';
/**
 * Shows rich text (`<color=primary>`, `<wave>`, `<icon=heart>`, `<input=confirm>`…) with an
 * optional typewriter at the player's text speed, per-character effects and correct line breaking
 * for CJK and right-to-left languages. Emits `done` when the typewriter finishes and `char` per
 * character.
 *
 * @example
 * ```vue
 * <RichText text="Press <input=confirm> to <wave>dance</wave>!" typewriter @done="ready = true" />
 * ```
 */
export { default as RichText } from './components/RichText.vue';
/**
 * The visual-novel text box of a {@link Dialogue}: name plate, portraits, typewriter, choices,
 * auto and skip modes, and the quick menu (AUTO, SKIP, LOG, SAVE, LOAD, MENU). `confirm` advances or
 * completes the line.
 *
 * @example
 * ```vue
 * <DialogueBox :dialogue="dialogue" :speakers="{ mira: { name: 'Mira', color: '#ff7aa2' } }" />
 * ```
 */
export { default as DialogueBox } from './components/DialogueBox.vue';
/**
 * Draws its content in the FX canvas above the UI so it can go through WebGL effects (`glitch`,
 * `halftone`, any Pixi `Filter`). The DOM content stays in place, invisible, and keeps receiving
 * focus, clicks and input. Emits `fallback` and shows the plain DOM when the browser cannot render it.
 *
 * @example
 * ```vue
 * <PixiRender :fx="['glitch']" :strength="0.3">
 *   <h1 class="logo">NIGHT SHIFT</h1>
 * </PixiRender>
 * ```
 */
export { default as PixiRender } from './components/PixiRender.vue';
/**
 * Keeps its content over a game object or a world point (name tags, health bars, interaction
 * hints). Hidden while the target is off-screen or destroyed, or kept at the screen edge with
 * `clamp`.
 *
 * @example
 * ```vue
 * <WorldAnchor :target="lantern" :offset="{ x: 0, y: -150 }" :margin="40">
 *   <InputPrompt action="confirm" label="LIGHT" />
 * </WorldAnchor>
 * ```
 */
export { default as WorldAnchor } from './components/WorldAnchor.vue';
/**
 * A video in a screen: background loops (`background`) or cutscenes. Plays every format of the
 * asset (`intro.webm`, `intro.mp4`) in the order the platform supports best, shows subtitles when
 * the player has them on, and follows the volume of a bus.
 *
 * @example
 * ```vue
 * <VideoPlayer src="menu-loop" background />
 * ```
 */
export { default as VideoPlayer } from './components/VideoPlayer.vue';
/**
 * A box framed by a nine-slice image: corners stay intact and edges stretch or repeat, so one
 * small frame image fits panels of any size.
 *
 * @example
 * ```vue
 * <NineSlice :src="frame" :slice="24" :border="16">
 *   <p>{{ t('shop.welcome') }}</p>
 * </NineSlice>
 * ```
 */
export { default as NineSlice } from './components/NineSlice.vue';
/**
 * A Persona-style skewed box whose content stays upright, with an optional offset shadow and text
 * outline. `active` highlights it (a focused menu row); `focusable` makes it a focus target that
 * emits `confirm`.
 *
 * @example
 * ```vue
 * <Skew :angle="-12" color="#e60012" shadow="#000" :active="focused === i">RESUME</Skew>
 * ```
 */
export { default as Skew } from './components/Skew.vue';
/**
 * A box with slanted left and right edges (cut by `left` and `right` pixels), for banners and
 * name plates.
 *
 * @example
 * ```vue
 * <Slant :left="0" :right="32" color="#111" shadow="#e60012">PLAYER 1</Slant>
 * ```
 */
export { default as Slant } from './components/Slant.vue';

// Widgets
/**
 * A focusable button for menus and dialogs, in the theme's `primary`, `secondary` or `danger`
 * style. `autofocus` makes it the first focused element of its screen.
 *
 * @example
 * ```vue
 * <Button variant="danger" autofocus @click="quit">{{ t('menu.quit') }}</Button>
 * ```
 */
export { default as Button } from './widgets/Button.vue';
/**
 * The yes/no dialog behind `ui.confirm()`. Opened as a modal it resolves with `true` (confirm),
 * `false` (cancel) or `undefined` (`back`).
 *
 * @example
 * ```ts
 * const ok = await useUi().modal<boolean>(ConfirmDialog, {
 *   title: 'Delete save',
 *   message: 'This cannot be undone.',
 *   confirm: 'Delete',
 *   danger: true,
 * });
 * ```
 */
export { default as ConfirmDialog } from './widgets/ConfirmDialog.vue';
/**
 * A number that counts up or down to `value` over `duration` ms (scores, coins), formatted with
 * `digits` decimals for `locale` (the browser's language by default).
 *
 * @example
 * ```vue
 * <Counter :value="score" :duration="400" />
 * ```
 */
export { default as Counter } from './widgets/Counter.vue';
/**
 * A bar for health, stamina or progress, with a trail that catches up after `trailDelay` ms to show
 * how much was just lost. The default slot is drawn over the bar.
 *
 * @example
 * ```vue
 * <Gauge :value="hp" :max="maxHp">HP {{ hp }}</Gauge>
 * ```
 */
export { default as Gauge } from './widgets/Gauge.vue';
/**
 * A grid of item cells navigable by gamepad, keyboard, mouse and touch; empty cells are `null`.
 * Emits `select` with the item and its index. The default slot draws a cell.
 *
 * @example
 * ```vue
 * <InventoryGrid :items="bag" :columns="4" @select="use">
 *   <template #default="{ item }">{{ item?.name }}</template>
 * </InventoryGrid>
 * ```
 */
export { default as InventoryGrid } from './widgets/InventoryGrid.vue';
/**
 * A vertical (or `horizontal`) menu of items with labels, hints and disabled entries; focus wraps
 * by default. Emits `select` with the item's value when confirmed and `focus` when it moves.
 *
 * @example
 * ```vue
 * <MenuList :items="[{ label: 'NEW GAME', value: 'new' }, { label: 'QUIT', value: 'quit' }]" @select="select" />
 * ```
 */
export { default as MenuList } from './widgets/MenuList.vue';
/**
 * A ring of items picked with the stick direction (or arrows, mouse, touch), for quick commands
 * and weapon wheels. Emits `select` with the value.
 *
 * @example
 * ```vue
 * <RadialMenu :items="orders" :radius="220" @select="(order) => screen.close(order)" />
 * ```
 */
export { default as RadialMenu } from './widgets/RadialMenu.vue';
/**
 * A virtualized list of rows of equal height: only the visible rows (plus `overscan`) are rendered,
 * and focus scrolls the list, so thousands of entries stay fast.
 *
 * @example
 * ```vue
 * <ScrollList :items="links" :item-height="64" :height="640" @select="open">
 *   <template #default="{ item }">{{ item.title }}</template>
 * </ScrollList>
 * ```
 */
export { default as ScrollList } from './widgets/ScrollList.vue';
/**
 * A value picked from a list with left and right (or a click), shown as `‹ value ›`; bind it with
 * `v-model`.
 *
 * @example
 * ```vue
 * <Select v-model="difficulty" label="DIFFICULTY" :options="[{ label: 'EASY', value: 'easy' }, { label: 'HARD', value: 'hard' }]" />
 * ```
 */
export { default as Select } from './widgets/Select.vue';
/**
 * A number between `min` and `max` changed by `step` with left and right, a drag or a click; bind
 * it with `v-model`.
 *
 * @example
 * ```vue
 * <Slider v-model="music" label="MUSIC" />
 * ```
 */
export { default as Slider } from './widgets/Slider.vue';
/**
 * A row of tabs bound to the selected index with `v-model`; `tabLeft` / `tabRight` (LB / RB, Q / E)
 * switch tabs wherever the focus is, and `prompts` shows their buttons.
 *
 * @example
 * ```vue
 * <Tabs v-model="tab" :tabs="['AUDIO', 'DISPLAY', 'CONTROLS']" prompts />
 * ```
 */
export { default as Tabs } from './widgets/Tabs.vue';
/**
 * A text field bound with `v-model`. Keyboard players type in it; confirming it with a gamepad
 * opens the {@link VirtualKeyboard}. Emits `submit` on Enter.
 *
 * @example
 * ```vue
 * <TextInput v-model="name" label="NAME" :max-length="12" @submit="create" />
 * ```
 */
export { default as TextInput } from './widgets/TextInput.vue';
/**
 * An on/off switch bound with `v-model`, flipped by confirm, left/right or a click.
 *
 * @example
 * ```vue
 * <Toggle v-model="subtitles" label="SUBTITLES" />
 * ```
 */
export { default as Toggle } from './widgets/Toggle.vue';
/**
 * Shows `text` next to its content while the content is hovered or focused (gamepad included).
 *
 * @example
 * ```vue
 * <Tooltip text="Restores 50 HP" side="bottom">
 *   <Button>Potion</Button>
 * </Tooltip>
 * ```
 */
export { default as Tooltip } from './widgets/Tooltip.vue';
/**
 * The on-screen keyboard used by `TextInput`, usable as a modal of its own. It resolves with the
 * typed text, or `undefined` when closed with `back` on an empty text.
 *
 * @example
 * ```ts
 * const name = await useUi().modal<string>(VirtualKeyboard, { value: 'Joker', maxLength: 12, title: 'NAME' });
 * ```
 */
export { default as VirtualKeyboard } from './widgets/VirtualKeyboard.vue';

// Ready-made screens
/**
 * The dialogue history of a {@link Dialogue}: every line and choice, newest last; `confirm` on a
 * line replays its voice. `DialogueBox` opens it from its LOG button.
 *
 * @example
 * ```ts
 * ui.push(Backlog, { dialogue });
 * ```
 */
export { default as Backlog } from './screens/Backlog.vue';
/**
 * A full-screen video screen with subtitles and hold-to-skip; closes with `'ended'` or
 * `'skipped'`. Open it with {@link playCutscene}.
 *
 * @example
 * ```ts
 * const how = await playCutscene(this.ui, 'intro', { subtitles: 'intro' });
 * ```
 */
export { default as Cutscene } from './screens/Cutscene.vue';
/**
 * Ready-made pause menu (UI-17): resume, settings, save, load, back to title, quit. Pauses the game
 * while open. Closes with `'resume'`, `'title'`, `'quit'` or `'loaded'`.
 *
 * @example
 * ```ts
 * if (this.input.pressed('pause')) this.ui.push(PauseScreen, { slots: fileSlots(this.game) });
 * ```
 */
export { default as PauseScreen } from './screens/PauseScreen.vue';
/**
 * Ready-made save / load screen (UI-17) over any {@link SaveSlots} implementation. Closes with
 * `'saved'`, `'loaded'` or `undefined` (back).
 *
 * @example
 * ```ts
 * await this.ui.modal(SaveLoadScreen, { mode: 'load', slots: fileSlots(this.game) });
 * ```
 */
export { default as SaveLoadScreen } from './screens/SaveLoadScreen.vue';
/**
 * Ready-made settings screen (UI-17): audio buses, video (full screen, UI scale, theme), controls
 * with rebinding, language, and accessibility. Every change applies at once and is saved.
 *
 * @example
 * ```ts
 * ui.push(SettingsScreen, { tabs: ['audio', 'video', 'controls', 'accessibility'] });
 * ```
 */
export { default as SettingsScreen } from './screens/SettingsScreen.vue';

declare module 'vue' {
  interface ComponentCustomProperties {
    /** Translates a key in the current language (see `t`). */
    $t: typeof translate;
  }
}
