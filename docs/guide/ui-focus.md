# Focus and input prompts

Menus are driven by one focus shared by every device. Directions from a gamepad or the keyboard move it to the nearest element on screen, the mouse moves it by hovering, and `confirm` or a click activates the focused element. Widgets are focusable already; other elements become focusable with `v-focus`.

```vue
<script setup lang="ts">
import { FocusGroup, vFocus } from '@blacklight/ui';

const pick = (slot: number) => console.log('slot', slot);
</script>

<template>
  <FocusGroup class="slots" wrap>
    <div v-for="slot in 3" :key="slot" v-focus class="slot" @click="pick(slot)">
      Slot {{ slot }}
    </div>
  </FocusGroup>
</template>

<style scoped>
.slot[data-bl-focused] {
  background: var(--bl-color-focus);
  color: var(--bl-color-accent);
}
</style>
```

## Focusable elements

| Markup              | Effect                                                                                   |
| ------------------- | ---------------------------------------------------------------------------------------- |
| `v-focus`           | Makes the element focusable (sets `data-bl-focus`). Import `vFocus` in `<script setup>`. |
| `v-focus="false"`   | Not focusable; switching the value adds or removes the attribute.                        |
| `v-focus.auto`      | Focusable, and focused first when its screen opens (sets `data-bl-autofocus`).           |
| `data-bl-focus`     | The attribute itself, for elements rendered without the directive.                       |
| `data-bl-autofocus` | The element focused first in its screen.                                                 |

An element is skipped when it has the `disabled` attribute or `aria-disabled="true"`, when it is inside an `[inert]` element (a screen covered by a `push` or a `modal`), or when it is outside the screen that holds the focus (see [focus scope](./ui#focus-scope)).

The focused element gets the `data-bl-focused` attribute; style it with `[data-bl-focused]`. It also receives the browser focus (without scrolling the page; a non-native element gets `tabindex="-1"` for that), and a scrolling container scrolls to keep it visible.

When a screen takes the focus, it goes to the element focused there last, else to the first element with `data-bl-autofocus`, else to the first focusable element in document order. When the focused element disappears (a `v-if`, a tab change) or a screen's content arrives later (lazy components), the same rule picks a new one.

## Moving

The `up`, `down`, `left` and `right` actions of every joined player give a direction; two held together give a diagonal. The first press moves at once; held, the move repeats after 380 ms, then every 90 ms. A diagonal with no element in that direction tries its vertical part (`up` or `down`), then its horizontal part. A direction that moves nothing (the edge of a trapping group, the last row without `wrap`) plays the theme's `error` sound.

The next element is chosen from the elements' boxes on screen (`getBoundingClientRect`, so skew and scale count):

- Only elements whose center lies ahead of the focused element's center count.
- For a cardinal direction, an element that overlaps the focused one on the other axis (a row straight below, even a wide one) is aligned and has no sideways cost. An offset element costs the gap between the edges plus a quarter of the distance between centers, and must start beyond the focused element's edge. The score is the distance along the direction plus three times the sideways cost; the lowest wins. In lists and grids this keeps the focus in its column or row instead of jumping to a closer but offset element.
- For a diagonal, only elements that are ahead on both axes count, scored by the distance along the diagonal plus 1.5 times the distance across.

Coordinates are measured in the browser's pixels; the ratios are the same in virtual pixels.

## Groups

A group changes how the focus moves among its elements. Use the `FocusGroup` component, `useFocus`, or the attribute `data-bl-focus-group` with space-separated options:

```vue
<FocusGroup axis="x" wrap trap>...</FocusGroup>
<div data-bl-focus-group="wrap y">...</div>
```

| `FocusGroup` prop | Attribute word | Meaning                                                                                               |
| ----------------- | -------------- | ----------------------------------------------------------------------------------------------------- |
| `wrap`            | `wrap`         | Past the last element in a direction, go to the farthest element the other way, the best aligned one. |
| `trap`            | `trap`         | Directions never leave the group.                                                                     |
| `axis="x"`        | `x`            | Only directions with a horizontal part move inside the group; `up` and `down` leave it at once.       |
| `axis="y"`        | `y`            | Only directions with a vertical part move inside the group; `left` and `right` leave it at once.      |

A move from an element inside a group first looks at the other elements of the nearest enclosing group (when the axis allows the direction), then wraps if asked. When that finds nothing, a trapping group keeps the focus; otherwise the move looks at every focusable element of the screen outside the group. When the element found is in another group that already had the focus, the focus lands on that group's last focused element instead, so going back to a list returns to the row you left.

Only the nearest group's options apply; nested groups each remember their last element.

## Memory

Each time the focus moves, the element is remembered for every group around it and for its screen. Closing a submenu returns the focus to the row that opened it; entering a group returns to its last element. Memory belongs to the elements: a screen opened again starts fresh.

## useFocus

`useFocus(items, options)` makes a focus group in a component and tells which item is focused, for lists drawn by hand:

```vue
<script setup lang="ts">
import { Skew, useFocus } from '@blacklight/ui';

const items = ['Resume', 'Items', 'Quit'];
const { focused, group, item } = useFocus(items, { wrap: true, axis: 'y' });
</script>

<template>
  <nav v-bind="group">
    <Skew v-for="(label, i) in items" :key="label" v-bind="item(i)" :active="focused === i">
      {{ label }}
    </Skew>
  </nav>
</template>
```

| Option | Meaning                          |
| ------ | -------------------------------- |
| `wrap` | As `FocusGroup`.                 |
| `trap` | As `FocusGroup`.                 |
| `axis` | `'x'` or `'y'`, as `FocusGroup`. |

| Returned   | Meaning                                                                       |
| ---------- | ----------------------------------------------------------------------------- |
| `focused`  | Computed index of the focused item, `-1` when the focus is outside the group. |
| `group`    | Attributes to bind on the group element.                                      |
| `item(i)`  | Attributes to bind on item `i` (makes it focusable).                          |
| `focus(i)` | Focuses item `i` when it is rendered.                                         |

The options are read once, when the component is set up. The `items` argument is not read; indexes come from `item(i)`.

## Confirm and the pointer

`confirm` (Enter, Space, `Pad:A`) plays the theme's `confirm` sound and calls `click()` on the focused element. A single `@click` handler therefore serves the mouse, touch, the keyboard and gamepads.

Hovering a focusable element with the mouse moves the focus to it (with the `move` sound); pressing on it focuses it without a sound, and the browser's click follows. Gamepad and mouse never show two different highlights.

## Widgets that use directions

Before moving, the focus manager dispatches a cancelable `bl-navigate` event on the focused element, with `detail.direction` (`'up'`, `'down'`, `'left'`, `'right'`, `'upleft'`, `'upright'`, `'downleft'`, `'downright'`). It bubbles. A widget that calls `preventDefault()` keeps the focus and uses the input itself; [`Slider`](./ui-widgets#slider), [`Toggle`](./ui-widgets#toggle) and [`Select`](./ui-widgets#select) take `left` and `right` this way, [`ScrollList`](./ui-widgets#scrolllist) takes `up` and `down` to scroll.

```vue
<script setup lang="ts">
import { vFocus, type NavigateDetail } from '@blacklight/ui';

const count = defineModel<number>({ required: true });

function onNavigate(event: Event) {
  const { direction } = (event as CustomEvent<NavigateDetail>).detail;
  if (direction !== 'left' && direction !== 'right') return;
  event.preventDefault();
  count.value += direction === 'right' ? 1 : -1;
}
</script>

<template>
  <div v-focus class="stepper" @bl-navigate="onNavigate">‹ {{ count }} ›</div>
</template>
```

An element can ask for the focus by dispatching a bubbling `bl-request-focus` event; the focus moves to it if it is focusable in the current screen. `ScrollList` uses this for rows it renders after scrolling.

## Tabs

`tabLeft` (Q, PageUp, `Pad:LB`) and `tabRight` (E, PageDown, `Pad:RB`) dispatch a `bl-tab` event, with `detail` `-1` or `1`, on the screen that receives `back` and on every element with the `data-bl-tabs` attribute inside it, wherever the focus is. [`Tabs`](./ui-widgets#tabs) listens to it; a custom tab bar can do the same.

## Sounds

UI sounds come from the theme's `sounds` field, as asset keys played on the `ui` bus:

```ts
defineTheme({
  ...personaTheme,
  name: 'my-theme',
  sounds: { move: 'ui-move', confirm: 'ui-confirm', back: 'ui-back' },
});
```

| Sound     | When                                                                                                                  |
| --------- | --------------------------------------------------------------------------------------------------------------------- |
| `move`    | The focus moves by a direction or by hovering; not when a screen opens.                                               |
| `confirm` | `confirm` is pressed with an element focused.                                                                         |
| `back`    | `back` is consumed by an `onBack` handler or closes a screen.                                                         |
| `error`   | A direction finds nothing to move to (each repeat included). `useUiRuntime().sound('error')` plays it from game code. |

A sound that is not loaded is skipped without an error. Load the files with the scenes that show menus, as any sound (see [Audio](./audio#loading)).

## Input prompts

`InputPrompt` shows the button bound to an action, for the device the player used last:

```vue
<InputPrompt action="confirm" label="SELECT" :size="44" />
<InputPrompt action="back" label="BACK" :size="44" />
```

| Prop     | Default         | Meaning                                                  |
| -------- | --------------- | -------------------------------------------------------- |
| `action` | required        | Input action whose binding to show.                      |
| `player` | `1`             | Player whose last device is followed.                    |
| `device` | the last device | Force `'keyboard'`, `'mouse'`, `'touch'` or `'gamepad'`. |
| `size`   | `48`            | Glyph size in virtual pixels.                            |
| `label`  | none            | Text after the glyph.                                    |

The binding shown is the first binding of the action for that device. When the action has none for it, the prompt shows a keyboard binding for a gamepad player; for a mouse or touch player, a keyboard binding, else a gamepad binding; and then the first binding of all. An action with no binding shows its name. A binding with no glyph in the pack (a key such as `F13`) is drawn as text in a key frame.

The prompt switches when the player changes device (the `device` event of the input) and when bindings change (`rebind`, `resetBindings`), so a controls menu shows the new button as soon as it is captured. Pressing on a UI screen with the mouse or a finger counts as using that device: those events never reach the canvas, where the input manager listens, so the layer reports them with `game.input.noteDevice()`. Hovering does not change the device.

Gamepad glyphs follow the family of the player's own pad (for player 1 before anyone joins, who reads every pad: the first connected pad), from its id: vendor `045e` or a name with `xbox` or `xinput` is Xbox; vendor `054c`, `playstation`, `dualsense`, `dualshock` or `wireless controller` is PlayStation; vendor `057e`, `nintendo`, `switch`, `pro controller` or `joy-con` is Switch; anything else uses Xbox art. Bindings use Xbox names by position, so on a Switch pad `Pad:A` (the bottom button) is drawn as Switch's B.

`useInputDevice(player)` gives the same information to your own components: `device` (a ref holding `'keyboard'`, `'mouse'`, `'touch'` or `'gamepad'`) and `family` (a computed `'xbox'`, `'playstation'` or `'switch'`).

### Prompt packs

The glyphs are [Kenney's Input Prompts](https://kenney.nl/assets/input-prompts) 1.5 (CC0), shipped in `@blacklight/ui/prompts` with their license: Xbox, PlayStation, Switch, keyboard and mouse, and touch. Each glyph is a separate SVG, and a build only includes the files a prompt referenced.

A game replaces the art with `setPromptPack`. `glyph` returns `{ src, text }` (`src` an image URL, `text` the fallback label), or `undefined` to use Kenney's glyph for that binding:

```ts
import { setPromptPack } from '@blacklight/ui';
import cross from '@assets/prompts/cross.png';

setPromptPack({
  name: 'my-pack',
  glyph(binding, family) {
    if (family === 'playstation' && binding === 'Pad:A') return { src: cross, text: 'Cross' };
    return undefined;
  },
});
```

`family` is `'xbox'`, `'playstation'`, `'switch'`, `'keyboard'`, `'mouse'` or `'touch'`. `glyphFor(binding, family)`, `bindingForDevice(bindings, device)` and `padFamily(pad)` are exported for prompts drawn by hand.

## Testing menus with a simulated gamepad

The UI reads gamepads through `navigator.getGamepads()`, so a Playwright test can replace it with a standard pad and set its buttons (`e2e/ui.spec.ts` drives the `persona-menu` pause menu this way):

```ts
await page.addInitScript(() => {
  const buttons = new Array(17).fill(0);
  Object.assign(window, { __pad: buttons });
  navigator.getGamepads = () => [
    {
      index: 0,
      id: 'Xbox Wireless Controller (STANDARD GAMEPAD Vendor: 045e Product: 0b13)',
      connected: true,
      mapping: 'standard',
      axes: [0, 0, 0, 0],
      buttons: buttons.map((value: number) => ({
        value,
        pressed: value > 0.5,
        touched: value > 0,
      })),
      timestamp: performance.now(),
      vibrationActuator: null,
    } as unknown as Gamepad,
  ];
});

async function press(page: Page, button: number) {
  await page.evaluate((b) => ((window as any).__pad[b] = 1), button);
  await page.waitForTimeout(90); // at least one step, less than the 380 ms repeat delay
  await page.evaluate((b) => ((window as any).__pad[b] = 0), button);
  await page.waitForTimeout(120);
}

const focused = () =>
  page.evaluate(() => document.querySelector('[data-bl-focused]')?.textContent?.trim());
```

Standard button indexes: A 0, B 1, LB 4, RB 5, Start 9, D-pad up 12, down 13, left 14, right 15. `page.emulateMedia({ reducedMotion: 'reduce' })` removes transitions and timelines, so screenshots do not depend on timing.

## Limits

- Navigation is spatial only: there is no explicit "next element" override per element.
