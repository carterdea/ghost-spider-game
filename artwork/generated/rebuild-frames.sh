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
