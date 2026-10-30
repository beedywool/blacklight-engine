# Widgets

Widgets are Vue components exported by `@blacklight/ui`, styled by the [theme](./ui-style#themes) and driven by the [focus](./ui-focus): each one works with a gamepad, a keyboard, a mouse and touch. Form widgets use `v-model`. Their CSS classes start with `bl-` and can be overridden from a screen's styles.

```vue
<script setup lang="ts">
import { ref } from 'vue';
import { Slider, Toggle } from '@blacklight/ui';

const music = ref(0.8);
const subtitles = ref(true);
</script>

<template>
  <Slider v-model="music" label="MUSIC" />
  <Toggle v-model="subtitles" label="SUBTITLES" />
</template>
```

The layout components (`Anchor`, `Skew`, `Slant`, `Mask`, `NineSlice`) are described in [Style, layout and motion](./ui-style#shapes); `FocusGroup` and `InputPrompt` in [Focus and input prompts](./ui-focus).

## Button

A focusable `<button>` in the theme's display font, skewed by the theme.

```vue
<Button autofocus @click="start">START</Button>
<Button variant="danger" :disabled="!canDelete" @click="remove">DELETE</Button>
```

<LiveExample src="widgets/button" hint="Arrows move the focus, Enter or a click presses; DELETE 3 unlocks at 3." />

| Prop        | Default     | Meaning                                                                                                                                  |
| ----------- | ----------- | ---------------------------------------------------------------------------------------------------------------------------------------- |
| `variant`   | `'primary'` | `'primary'` (filled), `'secondary'` (transparent with a `muted` outline, filled when focused) or `'danger'` (danger color when focused). |
| `disabled`  | `false`     | Not focusable, not clickable, drawn at 40 % opacity.                                                                                     |
| `autofocus` | `false`     | Focused first when the screen opens.                                                                                                     |

| Event   | When                          |
| ------- | ----------------------------- |
| `click` | Clicked, tapped or confirmed. |

## MenuList

A vertical (or horizontal) list of rows, the main menu of a screen. The focused row slides right, takes the focus colors and gets an offset shadow in the primary color.

```vue
<script setup lang="ts">
const items = [
  { label: 'NEW GAME', value: 'new' },
  { label: 'CONTINUE', value: 'continue', disabled: true },
  { label: 'CONFIG', value: 'config', hint: 'Audio, display, controls' },
];
</script>

<template>
  <MenuList :items="items" @select="onSelect" />
</template>
```

<LiveExample src="widgets/menu-list" hint="Up and down skip the disabled row; Enter selects." />

| Prop         | Default  | Meaning                                                                  |
| ------------ | -------- | ------------------------------------------------------------------------ |
| `items`      | required | `{ label, value, disabled?, hint? }[]`; `hint` is a smaller second text. |
| `wrap`       | `true`   | Past the last row, go back to the first.                                 |
| `horizontal` | `false`  | Rows side by side; then `up` and `down` leave the list.                  |
| `skewed`     | `true`   | Skew the rows by the theme's skew.                                       |

| Event                  | When                                  |
| ---------------------- | ------------------------------------- |
| `select(value, index)` | A row that is not disabled is chosen. |
| `focus(value, index)`  | A row receives the focus.             |

Disabled rows are skipped by the focus and drawn at 35 % opacity. `wrap` and `horizontal` are read when the list is created. Each row (`.bl-menu__item`) can be animated freely by a timeline; the visible shape is on its inner `.bl-menu__row`.

## Tabs

A tab bar switched with `tabLeft` and `tabRight` (Q and E, PageUp and PageDown, `Pad:LB` and `Pad:RB`) wherever the focus is, or by clicking a tab.

```vue
<script setup lang="ts">
const tab = ref(0);
</script>

<template>
  <Tabs v-model="tab" :tabs="['AUDIO', 'DISPLAY', 'CONTROLS']" prompts />
  <AudioSettings v-if="tab === 0" />
  <DisplaySettings v-else-if="tab === 1" />
  <ControlSettings v-else />
</template>
```

<LiveExample src="widgets/tabs" hint="Q and E switch tabs wherever the focus is." />

| Prop         | Default  | Meaning                                                         |
| ------------ | -------- | --------------------------------------------------------------- |
| `tabs`       | required | Tab labels.                                                     |
| `modelValue` | required | Index of the active tab.                                        |
| `prompts`    | `false`  | Show the `tabLeft` and `tabRight` buttons at both ends (36 px). |

| Event               | When                                               |
| ------------------- | -------------------------------------------------- |
| `update:modelValue` | A tab is chosen; the shoulder buttons wrap around. |

The tabs themselves are not focusable: directions stay in the content. When the focused element disappears with the old content, the focus goes to the screen's `data-bl-autofocus` element, else its first focusable element. Every `Tabs` of the screen that receives `back` reacts to the shoulder buttons.

## Gauge

A bar for HP, SP or progress. When the value drops, a trail in the danger color stays at the old value for a moment and then drains, showing what was lost.

```vue
<Gauge :value="hp" :max="maxHp">HP {{ hp }}</Gauge>
<Gauge :value="sp" :max="maxSp" color="#4aa8ff" :skewed="false" />
```

<LiveExample src="widgets/gauge" hint="A hit every second: the red trail shows the loss, then drains." />

| Prop         | Default              | Meaning                                           |
| ------------ | -------------------- | ------------------------------------------------- |
| `value`      | required             | Current value.                                    |
| `max`        | `100`                | Maximum.                                          |
| `trailDelay` | `450`                | ms before the trail starts draining after a loss. |
| `color`      | `--bl-color-primary` | Fill color.                                       |
| `trailColor` | `--bl-color-danger`  | Trail color.                                      |
| `skewed`     | `true`               | Skew the bar by the theme's skew.                 |

The default slot is a label drawn over the bar. The fill moves in 250 ms; after a loss the trail drains in 500 ms, after a gain it jumps in 50 ms. The bar is 28 px high and takes the width of its container.

## Counter

A number that counts to its new value instead of jumping, for money, scores and levels.

```vue
¥
<Counter :value="money" />
<Counter :value="ratio * 100" :digits="1" locale="fr-FR" />
```

<LiveExample src="widgets/counter" hint="The money counts to each new value." />

| Prop       | Default              | Meaning                           |
| ---------- | -------------------- | --------------------------------- |
| `value`    | required             | Target value.                     |
| `duration` | `600`                | Count duration in ms, easing out. |
| `digits`   | `0`                  | Decimal digits shown.             |
| `locale`   | the browser's locale | Number format (`toLocaleString`). |

Digits are tabular, so the width does not jump while counting.

## ScrollList

A virtual list: only the visible rows and a few around them are rendered, so a list of thousands of entries stays fast. Rows are focusable; moving past the last rendered row scrolls by one row and renders the next.

```vue
<ScrollList :items="links" :item-height="64" :height="640" @select="open">
  <template #default="{ item, index }">
    <div class="link">{{ index + 1 }}. {{ item.name }}</div>
  </template>
</ScrollList>
```

<LiveExample src="widgets/scroll-list" hint="10 000 rows; only the visible ones exist in the page." />

| Prop         | Default  | Meaning                                         |
| ------------ | -------- | ----------------------------------------------- |
| `items`      | required | The entries.                                    |
| `itemHeight` | required | Height of every row in virtual pixels.          |
| `height`     | required | Visible height in virtual pixels.               |
| `overscan`   | `4`      | Rows rendered above and below the visible ones. |

| Event                 | When                           |
| --------------------- | ------------------------------ |
| `select(item, index)` | A row is clicked or confirmed. |

The slot receives `item` and `index`. `up` and `down` stay in the list until its first or last entry; `left` and `right` leave it. The mouse wheel and touch scroll it; the scrollbar is hidden.

## InventoryGrid

A grid of equal cells, focusable one by one, for items and equipment. `null` entries are empty slots.

```vue
<InventoryGrid :items="bag" :columns="4" :cell-size="200" @select="use">
  <template #default="{ item }">
    <Tooltip v-if="item" :text="item.text">{{ item.name }}</Tooltip>
  </template>
</InventoryGrid>
```

<LiveExample src="widgets/inventory-grid" hint="Arrows move between cells; Enter uses an item." />

| Prop       | Default  | Meaning                                  |
| ---------- | -------- | ---------------------------------------- |
| `items`    | required | Cells, `null` for an empty one.          |
| `columns`  | required | Number of columns.                       |
| `cellSize` | `96`     | Cell width and height in virtual pixels. |
| `wrap`     | `false`  | Past an edge, go to the other side.      |

| Event                 | When                                                                |
| --------------------- | ------------------------------------------------------------------- |
| `select(item, index)` | A cell is clicked or confirmed; `item` is `null` for an empty cell. |

Empty cells are focusable too and have the `bl-grid__cell--empty` class. The focused cell gets an outline in the focus color and grows by 6 %.

## Slider

A value on a track. `left` and `right` change it by one step instead of moving the focus; the pointer sets it by pressing or dragging on the track.

```vue
<Slider v-model="music" label="MUSIC" />
<Slider v-model="scale" label="UI SCALE" :min="0.75" :max="1.5" :step="0.05">
  <template #default="{ value }">{{ Math.round(value * 100) }}%</template>
</Slider>
```

<LiveExample src="widgets/slider" hint="Left and right change the focused slider." />

| Prop         | Default  | Meaning                  |
| ------------ | -------- | ------------------------ |
| `modelValue` | required | Current value.           |
| `min`        | `0`      | Minimum.                 |
| `max`        | `1`      | Maximum.                 |
| `step`       | `0.1`    | Step; values snap to it. |
| `label`      | none     | Text before the track.   |

| Event               | When                                    |
| ------------------- | --------------------------------------- |
| `update:modelValue` | The value changes, snapped and clamped. |

The default slot replaces the displayed value, which is the position on the track in percent (0 to 100) by default.

## Toggle

An on/off switch. `right` turns it on, `left` off, `confirm` or a click flips it.

```vue
<Toggle v-model="subtitles" label="SUBTITLES" />
<Toggle v-model="vibration" label="VIBRATION" on="YES" off="NO" />
```

<LiveExample src="widgets/toggle" hint="Right on, left off, Enter flips." />

| Prop         | Default  | Meaning                |
| ------------ | -------- | ---------------------- |
| `modelValue` | required | State.                 |
| `label`      | none     | Text before the state. |
| `on`         | `'ON'`   | Text when on.          |
| `off`        | `'OFF'`  | Text when off.         |

| Event               | When               |
| ------------------- | ------------------ |
| `update:modelValue` | The state changes. |

## Select

A Persona-style "‹ Option ›" chooser. `left` and `right` cycle through the options, `confirm` or a click on the value goes to the next one, a click on an arrow goes that way.

```vue
<Select
  v-model="theme"
  label="THEME"
  :options="[
    { label: 'PERSONA', value: 'persona' },
    { label: 'BLACKLIGHT', value: 'blacklight' },
  ]"
/>
```

<LiveExample src="widgets/select" hint="THEME switches the UI theme live." />

| Prop         | Default  | Meaning                                     |
| ------------ | -------- | ------------------------------------------- |
| `modelValue` | required | Selected value, compared with `===`.        |
| `options`    | required | `{ label, value }[]`.                       |
| `label`      | none     | Text before the value.                      |
| `wrap`       | `true`   | Past the last option, go back to the first. |

| Event               | When                      |
| ------------------- | ------------------------- |
| `update:modelValue` | Another option is chosen. |

A value that matches no option shows the first one.

## TextInput

A text field. With a keyboard the player types in it; with a gamepad, `confirm` opens the [virtual keyboard](#virtualkeyboard) as a modal.

```vue
<TextInput v-model="name" label="NAME" placeholder="Joker" :max-length="12" @submit="save" />
```

<LiveExample src="widgets/text-input" hint="Click the field, type, press Enter." />

| Prop          | Default  | Meaning                |
| ------------- | -------- | ---------------------- |
| `modelValue`  | required | Text.                  |
| `label`       | none     | Text before the field. |
| `placeholder` | none     | Placeholder text.      |
| `maxLength`   | `64`     | Maximum length.        |

| Event               | When                                                                     |
| ------------------- | ------------------------------------------------------------------------ |
| `update:modelValue` | The text changes.                                                        |
| `submit(value)`     | Enter is pressed in the field, or the virtual keyboard's Done is chosen. |

During IME composition (Japanese, Chinese, Korean), partial text is not emitted; the text is emitted when the composition ends. Whether the virtual keyboard opens depends on `game.input.lastDevice` being `'gamepad'` when the field is confirmed; a mouse click or a tap on a UI screen sets it to `'mouse'` or `'touch'`, so clicking the field always types with the keyboard. While the keyboard is the last device, Left, Right, Space and Enter stay in the field (Enter emits `submit`); Up, Down and Escape leave it as everywhere else (letters typed in the field never become actions; named keys such as arrows, Escape, Enter and Tab do).

## VirtualKeyboard

The on-screen keyboard used by `TextInput`, usable as a modal of its own. It resolves with the typed text, or `undefined` when closed with `back` on an empty text.

```ts
const name = await useUi().modal<string>(VirtualKeyboard, {
  value: 'Joker',
  maxLength: 12,
  title: 'NAME',
});
```

<LiveExample src="widgets/virtual-keyboard" hint="Arrows pick keys, Enter types, Done closes." />

| Prop        | Default | Meaning               |
| ----------- | ------- | --------------------- |
| `value`     | `''`    | Initial text.         |
| `maxLength` | `64`    | Maximum length.       |
| `title`     | none    | Title above the text. |

Keys: digits, a QWERTY layout with `-`, `,`, `.` and `?`, then Shift (upper case), Space, Delete and Done. The keys form a wrapping focus group, and the first key is focused first. `back` deletes the last character, and closes the keyboard when the text is empty. It slides up on enter and down on leave.

## Tooltip

A bubble shown while its content is hovered or holds the focus.

```vue
<Tooltip text="Restores 50 HP" side="bottom">
  <span>Bead</span>
</Tooltip>
```

<LiveExample src="widgets/tooltip" hint="Hover or focus an item." />

| Prop   | Default  | Meaning                                                    |
| ------ | -------- | ---------------------------------------------------------- |
| `text` | required | Tooltip text.                                              |
| `side` | `'top'`  | `'top'`, `'bottom'`, `'left'` or `'right'` of the content. |

The focus shows it when the focused element is inside the tooltip (a tooltip around a button) or contains it (a tooltip in an `InventoryGrid` cell slot).

## Toasts

Short messages in the bottom-right corner, above every screen. They never take the focus.

```ts
import { toast } from '@blacklight/ui';

toast('Game saved', { kind: 'success' });
toast('No space left', { kind: 'error', duration: 4000 });
```

<LiveExample src="widgets/toasts" hint="A toast every 1.2 s, bottom right." />

| Option     | Default  | Meaning                                                           |
| ---------- | -------- | ----------------------------------------------------------------- |
| `kind`     | `'info'` | `'info'`, `'success'` or `'error'` (error uses the danger color). |
| `duration` | `2600`   | ms on screen, real time.                                          |

`useToast()` returns the same `toast` function for components. `toasts` is the reactive list on screen, newest last. Toasts are not tied to a scene and stay through scene changes.

## ConfirmDialog

The dialog behind `ui.confirm()`: a title, a message, and Cancel and Confirm buttons. Cancel has the focus first, so a stray press does not confirm.

```ts
const quit = await useUi().confirm({
  title: 'QUIT',
  message: 'Return to the title screen?',
  confirm: 'QUIT',
  danger: true,
});
```

<LiveExample src="widgets/confirm-dialog" hint="Left and right switch buttons; Enter answers." />

| Prop      | Default     | Meaning                               |
| --------- | ----------- | ------------------------------------- |
| `title`   | none        | Title.                                |
| `message` | required    | Question.                             |
| `confirm` | `'Confirm'` | Label of the confirm button.          |
| `cancel`  | `'Cancel'`  | Label of the cancel button.           |
| `danger`  | `false`     | Confirm button uses the danger style. |

The buttons are a horizontal, trapping and wrapping group: `left` and `right` switch, `up` and `down` do nothing. Cancel and `back` give `false`. Opened with `ui.modal(ConfirmDialog, props)`, it resolves with `true`, `false` or `undefined` (for `back`).

## RadialMenu

Items on a circle, picked with the stick or the D-pad direction, or by pointing with the mouse; `confirm` or a click chooses the selected one.

```vue
<script setup lang="ts">
import { RadialMenu, useScreen } from '@blacklight/ui';

const screen = useScreen({ enter: 'zoom' });
const orders = ['ATTACK', 'GUARD', 'HEAL', 'FREE'].map((label) => ({ label, value: label }));
</script>

<template>
  <RadialMenu :items="orders" :radius="220" @select="(order) => screen.close(order)" />
</template>
```

<LiveExample src="widgets/radial-menu" hint="Point with the arrows or the mouse; Enter gives the order." />

| Prop     | Default  | Meaning                                              |
| -------- | -------- | ---------------------------------------------------- |
| `items`  | required | `{ label, value, icon? }[]`; `icon` is an image URL. |
| `radius` | `180`    | Circle radius in virtual pixels.                     |
| `player` | `1`      | Player whose stick and D-pad select.                 |

| Event                  | When                                        |
| ---------------------- | ------------------------------------------- |
| `select(value, index)` | Confirmed or clicked with an item selected. |

The first item is at the top, the others clockwise at equal angles. Each time the UI reads input (every step, and every frame while the game is paused) the direction of the player's `left`, `right`, `up` and `down` selects the closest item, unless another screen covers the menu; a tilt under 0.35 keeps the current selection, so releasing the stick does not lose it. The menu is one focusable element that takes the focus when its screen opens and consumes every direction. It measures `radius × 2 + 160` px on each side.

## Limits

- `MenuList`'s `wrap` and `horizontal`, and the options of `useFocus`, are read once; changing them later has no effect.
- `Tabs` buttons are reachable with the mouse and the shoulder buttons only, not with directions.
- `ScrollList` rows all have the same height.
- The virtual keyboard has one QWERTY layout, without accents or other scripts.
- `Counter` and `Gauge` animate on the real-time clock, not the game clock.
