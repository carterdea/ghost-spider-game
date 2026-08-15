#!/usr/bin/env bash
# Rebuild the runtime sprite frames from the generated chroma-green strips.
# Seeds are hip-height points on each pose; scales are calibrated so every
# character keeps the on-screen size established by frames 01-06.
set -euo pipefail

cd "$(dirname "$0")/../.."
extract() { uv run --with pillow python3 scripts/extract_sprite_components.py "$@"; }

# Hero run cycle: contact / down / pass, then the same three with limbs swapped.
extract --input artwork/generated/hero-run-strip-chroma.png \
  --out-dir public/assets/characters/hero/frames --start-index 7 \
  --chroma-green --anchor-band 0.42,0.58 --scale 0.26 \
  --seed 214,368 --seed 549,404 --seed 892,354 \
  --seed 1283,370 --seed 1617,405 --seed 1946,355

# Hero idle: neutral / inhale / hold / exhale.
extract --input artwork/generated/hero-idle-strip-chroma.png \
  --out-dir public/assets/characters/hero/frames --start-index 13 \
  --chroma-green --anchor-band 0.42,0.58 --scale 0.2386 \
  --seed 358,371 --seed 826,365 --seed 1293,358 --seed 1772,371

# Hero swing: anchored on the raised fist, not the feet.
extract --input artwork/generated/hero-swing-strip-chroma.png \
  --out-dir public/assets/characters/hero/frames --start-index 17 \
  --chroma-green --anchor-band 0.0,0.08 --scale 0.2532 --hang-from-top 33 \
  --seed 329,326 --seed 783,360 --seed 1281,333 --seed 1780,299

extract --input artwork/generated/robot-walk-strip-chroma.png \
  --out-dir public/assets/characters/robot/frames --start-index 3 \
  --chroma-green --anchor-band 0.42,0.58 --scale 0.3779 \
  --seed 315,359 --seed 823,394 --seed 1329,355 --seed 1837,364

extract --input artwork/generated/enforcer-walk-strip-chroma.png \
  --out-dir public/assets/characters/enforcer/frames --start-index 3 \
  --chroma-green --anchor-band 0.42,0.58 --scale 0.351 \
  --seed 319,353 --seed 861,369 --seed 1359,360 --seed 1847,360

extract --input artwork/generated/drone-hover-strip-chroma.png \
  --out-dir public/assets/characters/drone/frames --start-index 3 \
  --chroma-green --scale 0.373 \
  --seed 274,391 --seed 798,405 --seed 1345,368 --seed 1859,362

# Hero idle, take two: 13-16 drifted in yaw between poses, so it read as a
# settle rather than a breath. These four hold one facing and one stance.
extract --input artwork/generated/hero-idle-v2-chroma.png \
  --out-dir public/assets/characters/hero/frames --start-index 21 \
  --chroma-green --anchor-band 0.42,0.58 --scale 0.2386 \
  --seed 275,400 --seed 818,400 --seed 1361,400 --seed 1904,400

# Drone hover, take two: 03-06 were a yaw sweep. These four hold station, so the
# emissive pulse is painted on here and the bob is a per-frame nudge.
uv run --with pillow python3 artwork/generated/pulse_emissive.py \
  --input artwork/generated/drone-hover-v2-raw-chroma.png \
  --output artwork/generated/drone-hover-v2-chroma.png \
  --columns 4 --gains 1.38,1.14,0.92,1.14

extract --input artwork/generated/drone-hover-v2-chroma.png \
  --out-dir public/assets/characters/drone/frames --start-index 7 \
  --chroma-green --scale 0.373 --offset-y 0,-2,-3,-2 \
  --seed 271,362 --seed 814,362 --seed 1357,362 --seed 1900,362

# --- Weapon and web props ------------------------------------------------
# Props are extracted per column rather than per seed: a flood fill keeps only
# the one connected shape it lands on, which silently drops the loose droplets
# and detached strands that make a splat read as splatter. Every prop registers
# on its frame centre because the runtime origin is the sprite centre, and
# --fit states the on-frame size directly, since props have no shared character
# height to calibrate a scale against.

# Web bomb in flight: spins freely, so it is radially balanced and evenly lit.
extract --input artwork/generated/web-bomb-flight-chroma.png \
  --out-dir public/assets/weapons/web-bomb \
  --chroma-green --columns 1 --fit 170 --centre

# Web bomb arming pulse. The three frames are one drawing tiled three times with
# only its emissives rescaled, so the silhouette cannot flicker between frames.
uv run --with pillow python3 artwork/generated/pulse_emissive.py \
  --input artwork/generated/web-bomb-armed-chroma.png \
  --output artwork/generated/web-bomb-armed-pulse-chroma.png \
  --tile --gains 0.62,1.0,1.5

extract --input artwork/generated/web-bomb-armed-pulse-chroma.png \
  --out-dir public/assets/weapons/web-bomb-armed \
  --chroma-green --columns 3 --fit 184 --centre

# Burst residue mesh. Drawn at 512 because it renders 400px wide in game.
extract --input artwork/generated/web-mesh-chroma.png \
  --out-dir public/assets/weapons/web-mesh \
  --chroma-green --columns 1 --frame-size 512 --fit 500 --centre

# Heavy web slug and tether dart, both drawn facing +X in a 2:1 frame. The dart
# is painted bright silver-lilac rather than the dark metal it started as: at
# its 26px runtime width a charcoal dart vanishes into the navy night sky.
extract --input artwork/generated/impact-web-chroma.png \
  --out-dir public/assets/weapons/impact-web \
  --chroma-green --columns 1 --frame-size 192 --frame-height 96 --fit 186 --centre

extract --input artwork/generated/web-line-dart-chroma.png \
  --out-dir public/assets/weapons/web-line-dart \
  --chroma-green --columns 1 --frame-size 192 --frame-height 96 --fit 186 --centre

# Three impact decals, deliberately different shapes so repeats do not stamp.
extract --input artwork/generated/web-splats-chroma.png \
  --out-dir public/assets/weapons/web-splat \
  --chroma-green --columns 3 --fit 184 --centre
