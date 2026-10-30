# Party Night (party game)

A Blacklight Engine template in the spirit of NumX: six mini-games for 1 to 8 players on one screen,
or online through a relay with rollback. Player 1 uses the keyboard or the first gamepad; every
other gamepad joins with its confirm button on the join screen. Each player plays as a guest, a
local profile (wins and points are kept) or the BlackLight account signed in on this device.

```sh
pnpm install
pnpm dev
pnpm test    # mini-game rules and online matches, headless
```

| Where                  | What                                                                                                  |
| ---------------------- | ----------------------------------------------------------------------------------------------------- |
| `scenes/title`         | Title menu: local party, online, settings, optional sign-in with BlackLight SSO                       |
| `scenes/player-select` | Join screen: up to 8 players, profile or guest, skin, "READY!"                                        |
| `scenes/game-select`   | Mini-game cards with their player range and two settings each                                         |
| `scenes/match`         | The shell: player banners and scores, pause menu, the mini-game hosted as a sub-scene, end panel      |
| `scenes/results`       | Podium, points of the match and of the whole party                                                    |
| `scenes/online`        | Relay address, host a room for a mini-game or join one by code                                        |
| `scenes/<mini-game>`   | One scene per mini-game with its own objects and `rules.ts`                                           |
| `party/minigame.ts`    | Base of the mini-games: banner and "GO!" (controls locked until then), power card, skins, online mode |
| `party/catalog.ts`     | The list of mini-games: scene, title, players, settings                                               |
| `party/session.ts`     | The party in progress and the local profiles                                                          |
| `objects/referee`      | State shared by every mini-game (phase, scores, cards, shields); each mini-game extends it            |
| `assets/`              | Card art (SVG) and sound effects (WAV)                                                                |

## Mini-games

| Mini-game     | Players | Rules                                                                                                  | Settings                       |
| ------------- | ------- | ------------------------------------------------------------------------------------------------------ | ------------------------------ |
| Survival VS   | 1–8     | Dodge the bouncing enemies, which speed up every 5 s. Three hits and out; one point per second alive.  | arena, number of enemies       |
| Air Hockey    | 2–8     | Two teams; each goal is a point for every player of the team; first team to the target gets a bonus.   | team layout, goals to win      |
| 50-50         | 1–8     | Pick a side before the doors open; the cloud strikes one side at random. One point per round survived. | last standing / all out, lives |
| Obstacles     | 1–8     | Walls with a gap push the players towards the water and get faster every 10 s. One point per wall.     | start speed, gap size          |
| Hide and Seek | 2–8     | Hide behind the blocks; the seeker throws three balls that knock blocks away, then guesses.            | seeker, hiding time            |
| Push-Push     | 2–8     | Sumo: `action` shoves whoever is in front of you; out of the ring, out. One point per second inside.   | ring size, time limit          |

Every mini-game starts with its title banner (controls locked) and "GO!". Each player has one
power card (`card`: C or the pad's Y): a shield for 3 s against hits, shoves, walls, the cloud and
guesses; in Air Hockey it makes the mallet larger. In Hide and Seek the seeker aims with the directions and throws or guesses with
`action`/`confirm`, or clicks where to aim.

## Online

The mini-game scenes are written for rollback from the start: their state lives on objects (the
referee and the players), they count steps instead of reading the clock, and they use `DMath` and
the scene's seeded `random`. The `@blacklight-deterministic` comment at the top of those files
turns on the `blacklight/deterministic` lint rule. With an `online` match the base class calls
`rollback()` and the same code runs on every machine.

To play online, run a relay (`pnpm exec blacklight-relay` from `@blacklight/relay`, its Docker
image, or the LAN relay of the desktop app), then: ONLINE › HOST A ROOM › pick the mini-game ›
CREATE ROOM, and give the code to the others (ONLINE › CODE › JOIN › READY!). The host starts when
everybody is ready. Online, each machine has one player.

## Accounts

`accounts-oidc` with `preset: 'blacklight'` signs players in with BlackLight SSO. Register the game
(`clientId: 'party-night'` in `game.config.ts`) as a public client with this page as redirect URI;
see the Accounts guide. Signing in is optional: guests and local profiles play offline.

## Limits

- Extra local players join with gamepads; a second keyboard player is not supported.
- Online, one player per machine, and a room plays one match: a new room is needed for the next one.
- The art and sounds are placeholders generated by `node e2e/fixtures/generate-party-game-assets.mjs`
  in the engine repository (CC0). There is no music.
