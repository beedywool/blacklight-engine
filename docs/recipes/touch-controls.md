# Touch controls

On phones and tablets, the [virtualJoystick](../behaviors/virtual-joystick) behavior draws a stick where the thumb lands and sets the same `left`, `right`, `up` and `down` actions as the arrows and the gamepad. Movement behaviors and your own `input.held('left')` checks work unchanged: there is no touch-specific code path in the game.

<LiveExample src="behaviors/virtual-joystick" hint="On a touch screen, slide a finger in the left half of the preview. With a keyboard, the arrows drive the same actions. Browser devtools can emulate touch." />

Steps for a touch-ready game:

1. Put the joystick on an object in the `hud` layer, so it stays put when the camera moves. Its `zone` (the left half of the screen by default) is where a touch starts it.
2. For buttons (jump, attack), put a [pointer](../behaviors/pointer) behavior on a HUD object whose `onDown` and `onUp` write the action's virtual value: `this.game.input.player(1).virtual.set('jump', 1)`, then `0`. The action reads as held, pressed and released like a key.
3. Show the stick only on touch devices: `game.input.lastDevice === 'touch'` switches when the player touches the screen, and [`InputPrompt`](../guide/ui-focus#input-prompts) follows the same value for button glyphs.

Menus need nothing more: UI screens react to taps directly, and focus follows the finger. See [Input](../guide/input#virtual-controls) for virtual controls and [Android and iOS](../guide/mobile) for safe areas and the back button.
