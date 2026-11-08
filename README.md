# Rooftop Scramble

A silly split-screen parkour racing game built with three.js. Up to four players race across town (with CPU runners filling the grid to six), climbing walls, vaulting barriers, bouncing off market stalls and knocking each other flying.

There are three courses and a training ground:

- **High Street**: shops, a canal and a building site, with rooftop routes above the road.
- **Rooftop Run**: entirely on the roofs. The street is out of bounds, so every alley is a jump.
- **Sky Circuit**: a rainbow obstacle course floating above the clouds.
- **Training Ground**: one short lesson per move, with on-screen prompts for your controller and no CPU runners. It's one step left of the High Street in the lobby.

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

In the lobby, press jump to join, item to leave, left/right to pick a course, Enter/Start to race, C to toggle CPU runners. Esc quits a race.

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
- `src/level/` – section-based level builder (`builder.ts`) and the courses (`courses.ts` lists them). Collision is plain boxes; the look is layered on top: one merged, bevelled, vertex-coloured mesh whose faces index a texture array (`surfaces.ts`), instanced architectural pieces such as windows, shopfronts and lamps (`kit.ts`), animated water and painted signs. `town.ts` holds the buildings and street furniture shared by the town courses
- `src/render.ts` – all split-screen views render into one multisampled target, then screen-space ambient occlusion, bloom, tone mapping, grading and a per-view vignette; also the sky and its image-based lighting
- `public/textures/` – hand-painted textures, signs and the billboard, generated with Codex image generation and downscaled
- `src/game.ts` – race rules, contacts, cameras and split-screen layout
- `src/items.ts`, `src/traffic.ts`, `src/bot.ts` – items, cars and CPU runners
- `src/character.ts` – procedurally animated runner model
