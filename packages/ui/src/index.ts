import './styles.css';

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
  defineTransition,
  getTransition,
  transitionNames,
  type ScreenTransition,
} from './transitions';
export {
  activeTheme,
  blacklightTheme,
  defineTheme,
  getTheme,
  personaTheme,
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
