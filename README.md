# Ghost Spider Swing

A Phaser 3 side-scroller about an original masked rooftop dancer swinging
through a painted, three-district New York night.

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

Check TypeScript:

```bash
bun run typecheck
```

## Controls

- `A` / `D`: move across the level
- `W` / `S`: move up and down the street plane when on foot
- `Space`: jump
- `E`: hold to attach up to two swing webs; old web-lines release as new ones catch
- `J`: web-glob strike on foot or close-range kick near enemies
- `Q`: cycle gadget
- `K`: use gadget
- `Shift`: slow fall with web-wings
- `R`: restart

## Game Loop

Swing between rooftops or drop to street level, protect the night crowd, and
clear patrol robots, tech enforcers, and survey drones while moving through:

- Midtown After Dark
- Park-Side Pursuit
- Bridge-Line Finale

The generated raster cast and panoramas use a repeatable chroma-key,
shared-scale sprite pipeline. Source art lives in `artwork/source`, normalized
runtime frames in `public/assets/characters`, and production backdrops in
`public/assets/environments`.
