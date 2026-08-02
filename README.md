# Ghost Spider Swing

A Phaser 3 side-scroller about an original masked rooftop dancer web-swinging
through a painted, five-district New York night.

## Stack

- Phaser `3.90.0`
- TypeScript `5.9.3`
- Vite `8.0.10`
- Bun for scripts and dependency management

## Run Locally

Install dependencies:

```bash
bun install
```

Start the game:

```bash
bun run dev
```

Open the local URL Vite prints, usually `http://localhost:5173/`.

Run the checks:

```bash
bun run typecheck
```

```bash
bun test
```

## Controls

- `A` / `D`: run, and pump the swing along your direction of travel
- `W` / `S`: reel the web-line in / let it out while swinging
- `Space`: jump — tap for a short hop, hold for full height
- `E`: hold to swing; the web catches the best arc ahead of you and lets go at
  the top so you keep your momentum
- `J`: web-glob strike, or a close-range kick near enemies
- `Q`: cycle gadget · `K`: use gadget
- `Shift`: slow the fall with web-wings
- `M`: mute · `R`: restart

## Game Loop

Each district is a discrete level with its own skyline, patrols, and a goal
beacon at the far end. Swing the rooftops, drop to the street, clear the patrol
robots, tech enforcers and survey drones, and touch the beacon to move on:

1. Midtown After Dark
2. Park-Side Pursuit
3. Spire Ascent
4. Harbor Crane Run
5. Bridge-Line Finale

Clearing the fifth district wins the run.

Enemies have to actually see you — range, a forward cone and a clear line —
and every attack is telegraphed and followed by a recovery window, so fights
are meant to be read and played around rather than absorbed. Robots close and
lunge, gunners hold a stand-off and draw a sight line before firing, drones
orbit above and dive.

## Architecture

Game rules are pure and framework-free; Phaser is only the presentation and
collision layer. That split is what makes the physics testable.

- `src/game/simulation/physics/` — pure, deterministic solvers with unit tests:
  `swing.ts` (rope as a hard distance constraint, not a spring), `locomotion.ts`
  (coyote time, jump buffering, variable jump height, apex float),
  `attachment.ts` (which anchor a web should catch and how long the line runs).
- `src/game/content/levels/` — data-driven level definitions. Buildings are
  authored as geometry; **web anchors are generated from that geometry**, so a
  web always attaches to something real. `levels.test.ts` asserts each level is
  actually playable: no unspannable gaps, no anchor dead zones, patrols that
  stand on real roofs.
- `src/game/simulation/ai/` — enemy decision making, same shape as the physics:
  a perception snapshot goes in, an intent comes out, and the Phaser layer only
  senses and applies.
- `src/game/simulation/systems/` — combat and level progression.
- `src/phaser/` — the engine layer. `actors/PlayerController.ts` bridges the
  pure solvers to an Arcade body, `world/LevelBuilder.ts` turns level data into
  scene geometry, `scenes/GameScene.ts` orchestrates.
- `src/ui/hud/` — DOM HUD that diffs against the last rendered values instead of
  rebuilding itself every frame.

## Sound

There are no audio files. Every sound is synthesised at runtime with the Web
Audio API, so the whole palette is editable in code — `src/audio/events.ts` is
a declarative table of oscillator and noise layers, one entry per game event.

The score lives in `src/audio/music/`, composed as note data rather than
waveforms: A natural minor, 104 BPM, an 18.5 second loop whose stems layer up
across the five districts so the run escalates as you go. `toMidiFile()`
exports it as a real MIDI file if you want to edit the song in a DAW.

## Art

The raster cast and panoramas use a repeatable chroma-key, shared-scale sprite
pipeline. Source art lives in `artwork/source`, normalized runtime frames in
`public/assets/characters`, and backdrops in `public/assets/environments`.
Props and UI shapes are drawn at runtime in `src/phaser/world/textures.ts`.
