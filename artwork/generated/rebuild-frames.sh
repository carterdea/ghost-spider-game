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
