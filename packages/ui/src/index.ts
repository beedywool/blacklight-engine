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
export { default as Anchor } from './components/Anchor.vue';
export { default as FocusGroup } from './components/FocusGroup.vue';
export { default as InputPrompt } from './components/InputPrompt.vue';
export { default as Mask } from './components/Mask.vue';
export { default as RichText } from './components/RichText.vue';
export { default as DialogueBox } from './components/DialogueBox.vue';
export { default as PixiRender } from './components/PixiRender.vue';
export { default as WorldAnchor } from './components/WorldAnchor.vue';
export { default as VideoPlayer } from './components/VideoPlayer.vue';
export { default as NineSlice } from './components/NineSlice.vue';
export { default as Skew } from './components/Skew.vue';
export { default as Slant } from './components/Slant.vue';

// Widgets
export { default as Button } from './widgets/Button.vue';
export { default as ConfirmDialog } from './widgets/ConfirmDialog.vue';
export { default as Counter } from './widgets/Counter.vue';
export { default as Gauge } from './widgets/Gauge.vue';
export { default as InventoryGrid } from './widgets/InventoryGrid.vue';
export { default as MenuList } from './widgets/MenuList.vue';
export { default as RadialMenu } from './widgets/RadialMenu.vue';
export { default as ScrollList } from './widgets/ScrollList.vue';
export { default as Select } from './widgets/Select.vue';
export { default as Slider } from './widgets/Slider.vue';
export { default as Tabs } from './widgets/Tabs.vue';
export { default as TextInput } from './widgets/TextInput.vue';
export { default as Toggle } from './widgets/Toggle.vue';
export { default as Tooltip } from './widgets/Tooltip.vue';
export { default as VirtualKeyboard } from './widgets/VirtualKeyboard.vue';

// Ready-made screens
export { default as Backlog } from './screens/Backlog.vue';
export { default as Cutscene } from './screens/Cutscene.vue';
export { default as PauseScreen } from './screens/PauseScreen.vue';
export { default as SaveLoadScreen } from './screens/SaveLoadScreen.vue';
export { default as SettingsScreen } from './screens/SettingsScreen.vue';

declare module 'vue' {
  interface ComponentCustomProperties {
    /** Translates a key in the current language (see `t`). */
    $t: typeof import('./i18n').t;
  }
}
