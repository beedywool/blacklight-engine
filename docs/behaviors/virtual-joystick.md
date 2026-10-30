# virtualJoystick

On-screen joystick for touch screens. It feeds the same actions as the keyboard and gamepads, so movement behaviors work unchanged.

```ts
const stick = this.spawn(Container, { layer: 'hud' });
stick.addBehavior(behaviors.virtualJoystick({ radius: 100 }));
```

| Option          | Default                       | Meaning                                                   |
| --------------- | ----------------------------- | --------------------------------------------------------- |
| `radius`        | `90`                          | Knob travel in virtual px.                                |
| `zone`          | left half of the screen       | Screen rectangle where a touch starts the joystick.       |
| `actions`       | `left`, `right`, `up`, `down` | Actions it drives.                                        |
| `player`        | `1`                           | Player whose actions it drives.                           |
| `alwaysVisible` | `false`                       | Show the joystick at its spawn position when not touched. |

Put it on an object in the `'hud'` layer. A touch in `zone` places the joystick under the finger; the knob's offset sets the four actions (0 to 1 each). `value` holds the current direction, length 0 to 1. Releasing resets the actions to 0 and hides the joystick, or with `alwaysVisible` moves it back to where it was spawned.

## Example

<LiveExample src="behaviors/virtual-joystick" hint="On a touch screen, touch the left half and slide. With a keyboard, the arrows drive the same actions." />

## Limits

- It reads touches only; it does not react to the mouse.
