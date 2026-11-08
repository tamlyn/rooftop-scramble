# Rooftop Scramble

A silly split-screen parkour racing game built with three.js. Up to four players race across town (with CPU runners filling the grid to six), climbing walls, vaulting barriers, bouncing off market stalls and knocking each other flying.

```sh
npm install
npm run dev
```

## Controls

| | Move | Jump | Dive / tackle | Use item |
|---|---|---|---|---|
| Keyboard 1 | WASD | Space | Left Shift | E |
| Keyboard 2 | Arrows | / | . | , |
| Gamepad | Left stick or D-pad (RT also runs) | A | X or B | Y, LB or RB |

In the lobby, press jump to join, item to leave, Enter/Start to race, C to toggle CPU runners. Esc quits a race.

## Moves

- **Climb**: run into a wall. You can scale about 6 m before your grip runs out.
- **Vault / mantle**: anything up to chest height is vaulted automatically; in the air you grab any ledge just above your head.
- **Wall jump**: jump while climbing. You keep enough grip to catch the opposite wall, so narrow alleys can be chimney-climbed.
- **Dive**: a burst of speed that tackles anyone you hit. Dive in mid-air for extra distance, or just before landing to roll out of a big drop instead of going splat. Jump out of a dive slide to keep the momentum.
- **Bounce pads**: pink tops on stalls, the bouncy castle and building-site trampolines.

## Items

Rocket (homes in on the runner ahead), grappling hook (zips you to the yellow rings, or yanks the runner ahead back), bulldozer, bar of soap, spring shoes, triple espresso and a flock of pigeons for the leader's face. Runners further back get the nastier items.

## Code map

- `src/runner.ts` – movement and parkour simulation (fixed 60 Hz tick, axis-aligned box collision)
- `src/level/` – section-based level builder and the city layout; static geometry merges into one mesh
- `src/game.ts` – race rules, contacts, cameras and split-screen rendering
- `src/items.ts`, `src/traffic.ts`, `src/bot.ts` – items, cars and CPU runners
- `src/character.ts` – procedurally animated runner model
