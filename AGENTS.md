# AGENTS.md

Notes for coding agents working on Rooftop Scramble. Read `README.md` first for controls, moves and the code map.

## Commands

- `npm run dev` – Vite dev server
- `npm run typecheck` – TypeScript 7 (`tsgo`), strict, with unused locals and parameters as errors
- `npm run build` – typecheck plus production build; run it before calling work done

There are no automated tests. Check gameplay and visual changes in a real browser (see below).

## Architecture rules

- **Simulation and visuals are separate.** `runner.ts` steps at a fixed 60 Hz against plain axis-aligned boxes in `physics.ts`. Everything visual is layered on top and must not change collision. Decorative geometry uses `collide: false`, `decor`, `instance` or `poster`. Buildings are a hidden collision box with visual boxes over it.
- **Tuning lives in `config.ts`.** Movement numbers interact (for example, vault and ledge reach versus wall heights in the level), so if you change one, replay the affected sections.
- **Courses are authored per section.** In a `Section`, `x` runs across the course from -18 to +18 and `d` is the distance from the section's entry, so layouts read the same whichever way the section turns. Facings are `[fx, fd]` in the same frame. Kit pieces in `kit.ts` are modelled facing +z, with the wall plane at z = 0.
- **Every course needs:**
  - A registration in `courses.ts`.
  - A `reseed(...)` call at the start of its build function, so its random dressing doesn't depend on which courses were built first.
  - A `killHeight` that suits it: runners below it respawn at their last checkpoint.
- **CPU runners follow the routes.**
  - Each section's `route`s are waypoint paths to its next checkpoint, and route 0 is the fallback for CPUs that get stuck.
  - CPUs can't dive or wall-jump, so every route needs gaps they can clear with a plain running jump: about 4 m on the level, more with a drop.
  - Checkpoints can sit at the edge of a gap; the builder moves each respawn point onto the nearest solid ground beyond it.
- **Keep draw calls low.**
  - Boxes and decor merge into one vertex-coloured mesh whose `surface` attribute indexes a texture array (`surfaces.ts`).
  - Repeated props are `InstancedMesh`es bucketed into 48 m cells for culling. Small kit pieces also have a `range` beyond which their cell isn't drawn at all.
  - Add new repeated props as a kit, not as individual meshes.
- **Rendering goes through `Pipeline` (`render.ts`).**
  - Every split-screen view renders into one multisampled half-float target with depth via `pipeline.view(...)`. Ambient occlusion, bloom, tone mapping and grading then run once over the whole target.
  - The renderer's own antialiasing is deliberately off.
  - Cameras must use `NEAR`/`FAR` from `render.ts`, because the post-processing passes linearise depth with them.
- **Art direction:**
  - The look is a soft-lit stylised diorama (Poly Bridge 3 and stylised European city asset packs are the references): chunky bevelled shapes, no outlines.
  - Colour has a hierarchy. Walls, roofs and ground are quiet stone, stucco, brick and slate. Saturation is saved for shopfronts, awnings, runners, items and gameplay objects. Candy-coloured walls make the whole scene look like a toy.
  - Surface textures should be barely visible at a realistic scale; `contrast` in `surfaces.ts` tames busy ones. Detail should come from geometry and light.
  - Use `matte()` and `plastic()` from `materials.ts` rather than ad hoc materials.
  - Before and after a visual change, screenshot fixed views and compare them with the references. Codex is useful for a second opinion on screenshots.

## Performance

The scene is heavy: about 1.2M triangles per frame on the High Street and 2.5M on Rooftop Run (counting the shadow pass), plus half-res SSAO and bloom, with up to four views. Be careful with:

- Shadow casters. Small kit pieces mostly shouldn't cast shadows.
- New full-screen passes.
- Per-frame allocations in the update loop.

If frame rate suffers, try these first:

1. Fewer shadow casters.
2. Drop MSAA samples from 4× to 2×.
3. Reduce SSAO samples.

## Textures and signs

- Images in `public/textures/` were generated with the Codex CLI's image generation, then downscaled to JPEG. Raw outputs live in `art/`, which is gitignored.
- Surface textures must be neutral-toned and seamlessly tileable. The level material normalises their brightness and tints them with each box's vertex colour.
- Hanging signs are 3:2 and listed in `SIGNS` in `builder.ts`.

To generate one non-interactively:

```sh
codex exec --skip-git-repo-check -s workspace-write "<prompt; save to art/name.png>" < /dev/null > art/name.log 2>&1
sips -s format jpeg -s formatOptions 88 -Z 512 art/name.png --out public/textures/name.jpg
```

Without `< /dev/null`, Codex waits on stdin and hangs.

## Checking changes in a browser

- In dev builds, `window.debug` exposes `renderer`, `level`, `game` and `selectCourse(step)`. `renderer.info` gives triangle and draw call counts.
- Teleport a runner with `game.runners[0].pos`, using `level.checkpoints[i].spawn`/`dir`/`heading` as reference points, then call `game.update(dt)` to settle the camera before taking a screenshot.
- From the lobby, Space joins player 1 and Enter starts the race.
- To check that a course is raceable, park player 1 out of the way and call `game.update(1 / 30)` in a loop for a few simulated minutes. Every CPU should finish. Wrap `game.respawn` to count falls and see where they happen.
- Headless browsers use software rendering, so their frame timings mean nothing. Judge performance only on real hardware.
