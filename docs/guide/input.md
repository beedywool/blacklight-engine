# Input

Game code reads named actions, not keys. An action (`jump`, `left`, `fire`) is bound to keys, mouse buttons, touch and gamepad inputs; the same code works with every device, and players can rebind. Input state changes once per fixed step, before the scenes update, so `pressed` is `true` for exactly one step.

```ts
override update() {
  if (this.input.pressed('jump')) this.jump();
  const move = this.input.vector('left', 'right', 'up', 'down');
  this.velocity.set(move.x * 240, move.y * 240);
}
```

In a scene, `this.input` is the input manager; its `pressed`, `held`, `released`, `value`, `axis` and `vector` read player 1. In an object, `this.input` is the input of the object's `player` (1 by default).

<LiveExample src="concepts/input" hint="Arrows/WASD or a gamepad move the dot (vector), J or a click fires (custom action), held keys light up." />

## Actions and bindings

Actions are declared in `game.config.ts` and merged over the defaults:

```ts
export default defineConfig({
  // ...
  input: {
    actions: {
      fire: ['KeyJ', 'Mouse:Left', 'Pad:RT'],
      jump: ['Space', 'Pad:A'], // replaces the default jump bindings
    },
    deadzone: 0.25,
  },
});
```

| Field      | Default        | Meaning                                                                                     |
| ---------- | -------------- | ------------------------------------------------------------------------------------------- |
| `actions`  | defaults below | Action name → list of bindings. An action given here replaces the default of the same name. |
| `deadzone` | `0.2`          | Stick values below this count as 0; the rest is rescaled to 0–1.                            |

Default actions, available in every game:

| Action     | Bindings                                                |
| ---------- | ------------------------------------------------------- |
| `left`     | `ArrowLeft`, `KeyA`, `Pad:Left`, `Pad:LeftStickLeft`    |
| `right`    | `ArrowRight`, `KeyD`, `Pad:Right`, `Pad:LeftStickRight` |
| `up`       | `ArrowUp`, `KeyW`, `Pad:Up`, `Pad:LeftStickUp`          |
| `down`     | `ArrowDown`, `KeyS`, `Pad:Down`, `Pad:LeftStickDown`    |
| `confirm`  | `Enter`, `Space`, `Pad:A`                               |
| `back`     | `Escape`, `Backspace`, `Pad:B`                          |
| `pause`    | `Escape`, `Pad:Start`                                   |
| `jump`     | `Space`, `KeyZ`, `Pad:A`                                |
| `action`   | `KeyX`, `ShiftLeft`, `Pad:X`                            |
| `tabLeft`  | `KeyQ`, `PageUp`, `Pad:LB`                              |
| `tabRight` | `KeyE`, `PageDown`, `Pad:RB`                            |

Binding syntax:

| Binding                                                                               | Input                                                                                                                                                                                          |
| ------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `KeyA`, `Space`, `ArrowLeft`, `ShiftLeft`, `Digit1`, `Enter`…                         | A keyboard key by its [`KeyboardEvent.code`](https://developer.mozilla.org/docs/Web/API/UI_Events/Keyboard_event_code_values): the physical key, whatever the layout. `Key:Space` is the same. |
| `Mouse:Left`, `Mouse:Right`, `Mouse:Middle`, `Mouse:Back`, `Mouse:Forward`            | A mouse button.                                                                                                                                                                                |
| `Touch`                                                                               | Any finger on the screen.                                                                                                                                                                      |
| `Pad:A`, `Pad:B`, `Pad:X`, `Pad:Y`                                                    | Face buttons, Xbox names (bottom, right, left, top).                                                                                                                                           |
| `Pad:LB`, `Pad:RB`, `Pad:LT`, `Pad:RT`                                                | Shoulders and triggers. Triggers are analog.                                                                                                                                                   |
| `Pad:Back`, `Pad:Start`, `Pad:Home`                                                   | Menu buttons.                                                                                                                                                                                  |
| `Pad:LS`, `Pad:RS`                                                                    | Stick clicks.                                                                                                                                                                                  |
| `Pad:Up`, `Pad:Down`, `Pad:Left`, `Pad:Right`                                         | D-pad.                                                                                                                                                                                         |
| `Pad:LeftStickLeft`, `Pad:LeftStickRight`, `Pad:LeftStickUp`, `Pad:LeftStickDown`     | Left stick directions, analog.                                                                                                                                                                 |
| `Pad:RightStickLeft`, `Pad:RightStickRight`, `Pad:RightStickUp`, `Pad:RightStickDown` | Right stick directions, analog.                                                                                                                                                                |

An invalid binding in `game.config.ts` stops the game with the accepted forms. Action names are typed from the configuration (see [Assets](./assets#generated-types)): `pressed('jupm')` is a type error, and at runtime an unknown action logs a warning once and reads as not pressed.

`confirm`, `back`, the four directions, `tabLeft` and `tabRight` also drive the [UI layer](./ui)'s menus. While a menu blocks game input (`input.blocked`), every action reads as idle in game code; the UI reads through `input.uiPlayer(n)`, which is never blocked.

Keys bound to an action do not scroll the page. Letters typed in a text field are left to the field; named keys there (arrows, Escape, Enter, Tab) still feed actions, so menus can leave the field. When the window loses focus every key, button and touch is released, so no action stays stuck.

## Reading actions

| Method                          | Returns                                                                    |
| ------------------------------- | -------------------------------------------------------------------------- |
| `pressed(action)`               | `true` during the step the action went down.                               |
| `held(action)`                  | `true` while it is down (value 0.5 or more).                               |
| `released(action)`              | `true` during the step it went up.                                         |
| `value(action)`                 | 0 to 1: analog value for sticks and triggers, 0 or 1 for keys and buttons. |
| `axis(negative, positive)`      | −1 to 1: `axis('left', 'right')`.                                          |
| `vector(left, right, up, down)` | A `Vector2` of length at most 1, so diagonals are not faster.              |

The value of an action is the largest value among its bindings. A key tapped and released between two steps still counts as pressed for one step.

## Pointer and touches

```ts
override update() {
  if (this.pointer.pressed) this.spawn(Spark, { x: this.pointer.x, y: this.pointer.y });
}
```

`scene.pointer` is the mouse or the last touch in the scene's world coordinates (through the main camera), with `screen` (the position in virtual pixels of the design area), `down`, `pressed` and `released`. `game.input.pointer` holds the screen position and also `type` (`'mouse'`, `'touch'` or `'pen'`). `game.input.touches` maps each finger's pointer id to its screen position, for multi-touch. Right-clicks do not open the browser's context menu on the canvas.

For clickable objects, use the [`pointer` behavior](./behaviors#pointer).

## Local players

Up to 8 players share one machine. Player 1 starts with every device: keyboard, mouse, touch and every gamepad. Other players join with a gamepad.

```ts
// join screen: call every step
override update() {
  const player = this.input.join('confirm');
  if (player) this.spawn(Cursor, { player: player.number, x: 200 * player.number, y: 540 });
}
```

| Member                         | Meaning                                                                                                                                                                 |
| ------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `input.player(n)`              | The `PlayerInput` of player `n` (1 to 8): `pressed`, `held`, `released`, `value`, `axis`, `vector`, `rumble`.                                                           |
| `input.joinedPlayers`          | Joined players, player 1 first.                                                                                                                                         |
| `input.join(action, max)`      | When a gamepad no joined player owns presses `action` (`confirm` by default), adds a player with that pad and returns it. `max` (default 8) caps the number of players. |
| `input.assignPad(player, pad)` | Gives a gamepad (by index) to a player and takes it from the others; the player joins.                                                                                  |
| `input.leave(player)`          | Removes a player and frees its devices. Player 1 cannot leave.                                                                                                          |

When the first player joins after player 1, player 1 keeps the keyboard, mouse, touch and the gamepad it used last; every other pad becomes free to join.

Objects read their player's input through `this.input`: spawn them with `player: 2` and the same behaviors drive player 2. A `PlayerInput` has public `keyboard`, `mouse` and `touch` flags; setting `input.player(2).keyboard = true` lets player 2 read the keyboard too, which suits two players on one keyboard with separate actions (`p2-left`, `p2-right`…).

The `join` event on `input.events` fires with `{ player, device, pad }`.

## Rebinding

```ts
// "Press a key" screen
const binding = await this.input.captureBinding();
if (binding) this.input.rebind('jump', [binding, 'Pad:A']);
```

| Member                     | Meaning                                                                                                                                            |
| -------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------- |
| `rebind(action, bindings)` | Replaces the bindings of an action. Invalid bindings throw.                                                                                        |
| `resetBindings(action?)`   | Restores the bindings from `game.config.ts` for one action, or for all.                                                                            |
| `captureBinding()`         | Resolves with the next key, mouse button or gamepad button pressed. Escape resolves with `undefined`. The captured input does not trigger actions. |
| `bindingsOf(action)`       | Current bindings of an action.                                                                                                                     |
| `actions`                  | Every action name.                                                                                                                                 |

`bindingLabel(binding)`, imported from `@blacklight/core`, gives the readable form for menus: `KeyA` → `A`, `Mouse:Left` → `Left click`, `Pad:LT` → `LT`.

Changed bindings are saved in `game.settings` under `input.bindings` and loaded at the next start. Only actions that differ from the configuration are stored, so a game update that changes a default reaches players who never rebound that action.

## Last device

`input.lastDevice` is the kind of device used last (`'keyboard'`, `'mouse'`, `'touch'` or `'gamepad'`), and `input.player(n).lastDevice` the one of each player. The `device` event on `input.events` fires when it changes, to switch button prompts:

```ts
this.listen(this.input.events, 'device', (device) => this.showPrompts(device));
```

Pointer events on the HTML UI layer do not reach the canvas, so the UI layer reports its presses with `input.noteDevice(device, player?)`; code that handles input outside the canvas can do the same.

`input.events` also has `gamepadconnected` and `gamepaddisconnected` with `{ index, id }`.

## Rumble

```ts
this.input.rumble(0.8, 0.3, 250);
```

`rumble(strong, weak = strong, duration = 200)` vibrates every gamepad of the player. Strengths go from 0 to 1, the duration is in ms.

## Virtual controls

`input.player(n).virtual` is a map of action → value (0 to 1) that on-screen controls write; the value counts like any other binding. The [`virtualJoystick` behavior](./behaviors#virtualjoystick) uses it. A touch button sets its action to 1 while pressed and to 0 when released:

```ts
this.game.input.player(1).virtual.set('jump', pressed ? 1 : 0);
```

## Gamepads

Gamepads are read through the browser's Gamepad API and normalized to the Xbox layout above. A pad the browser reports with the standard mapping (most Xbox, PlayStation and Switch Pro pads in Chrome, Edge and Firefox) is read directly. Other pads are matched by vendor and product id against [SDL_GameControllerDB](https://github.com/mdqinc/SDL_GameControllerDB), bundled with the engine and downloaded as a separate chunk the first time a non-standard pad appears; a pad with no entry for the current platform is read as if it were standard. `input.gamepads` lists the connected pads as `PadState` (`index`, `id`, `buttons` in `PAD_BUTTONS` order, `axes`).

## Limits

- Players 2 to 8 join with a gamepad; keyboard and touch belong to player 1 unless the game sets the flags itself.
- SDL mapping on the web is best effort for non-standard pads: browsers expose raw buttons and axes differently, and hats are read from the POV axis (Chrome) or the last two axes (Firefox). Desktop builds will read pads through SDL directly when the desktop package lands.
- Rumble works where the browser implements gamepad vibration (Chrome, Edge); elsewhere it does nothing.
- `captureBinding` captures keys, mouse buttons and gamepad buttons, not stick directions or touch.
- Browsers only report a gamepad after a button press on the page.
