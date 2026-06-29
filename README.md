# Ghost Spider Swing

A tiny Phaser 3 tracer-bullet prototype for a keyboard side-scroller about a ballerina spider hero swinging through NYC.

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

## Prototype Loop

Swing between rooftops or drop to street level, avoid robot and hooded gunner attacks, and clear enemies for score while protecting health.

Gadgets are based on Ghost-Spider / Gwen Stacy's Janet Van Dyne web-shooters: web-lines, globs, nets, shield-like web shapes, and web-wings.
