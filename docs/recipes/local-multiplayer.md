# Local multiplayer

Up to 8 players share one machine. Player 1 starts with every device; the others join with a gamepad. Objects read their own player's input through `this.input`, so the same class with the same behaviors drives any player: spawn it with `player: 2`.

## A join screen

`input.join()` is called every step on the join screen. When a gamepad that no player owns presses `confirm`, it creates the next player, gives it that pad and returns it:

```ts
import { Scene } from '@blacklight/core';
import Racer from '@objects/racer/racer.object';

export default class Lobby extends Scene {
  override update() {
    const player = this.input.join('confirm', 4);
    if (player) this.spawn(Racer, { x: 200 * player.number, y: 540, player: player.number });

    if (this.input.pressed('pause') && this.input.joinedPlayers.length > 1)
      void this.goto('race', { players: this.input.joinedPlayers.map((p) => p.number) });
  }
}
```

Every movement behavior reads `object.input`, the input of the object's player, so `Racer` needs no change to be driven by player 3. The `join` event on `input.events` fires with `{ player, device, pad }` for a join screen made of UI screens rather than objects; `assignPad(player, pad)` moves a pad from one player to another.

## Two players on one keyboard

Without gamepads, two players can share the keyboard with separate actions. Rebind the default directions to the arrows only, add actions for the second player, and give the second object's behavior those action names:

<LiveExample src="recipes/split-screen" hint="Click the preview. Arrows move the white player, WASD the red one." />

Both objects belong to player 1 here, which owns the keyboard; they differ by the actions they read. The same example shows [split screen](./split-screen).

## Limits

- Players 2 to 8 join with gamepads; keyboard and touch belong to player 1 unless the game sets `input.player(n).keyboard` or `touch` itself.
- On the web, browsers expose gamepads only after a button is pressed while the page has focus.
- Online multiplayer is a separate package: see [Networking](../guide/networking).
