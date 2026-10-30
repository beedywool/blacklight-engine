// On a touch screen, touch the left half and slide: the joystick drives the same actions as the
// arrows, so the ball's eightDirections behavior needs no change. With a keyboard, use the arrows.
import {
  Container,
  Graphics,
  Scene,
  Text,
  behaviors,
  type VirtualJoystick,
} from '@blacklight/core';

class Ball extends Graphics {
  static override behaviors = [behaviors.eightDirections({ speed: 420 })];

  override create() {
    this.draw.circle(0, 0, 36).fill(0xffffff);
  }
}

export default class Example extends Scene {
  stick!: Container;
  readout!: Text;

  override create() {
    this.spawn(Ball, { x: 840, y: 360 });
    // HUD layer: screen coordinates, whatever the camera does.
    this.stick = this.spawn(Container, { x: 200, y: 540, layer: 'hud' });
    this.stick.addBehavior(behaviors.virtualJoystick({ radius: 100, alwaysVisible: true }));
    this.readout = this.spawn(Text, {
      x: 200,
      y: 680,
      layer: 'hud',
      style: { fill: 0x8e8e8e, fontFamily: 'monospace', fontSize: 24 },
    });
  }

  override update() {
    // `value` is the knob direction, length 0 to 1.
    const { value } = this.stick.behavior<VirtualJoystick>('virtualJoystick')!;
    this.readout.text = `x ${value.x.toFixed(2)}  y ${value.y.toFixed(2)}`;
  }
}
