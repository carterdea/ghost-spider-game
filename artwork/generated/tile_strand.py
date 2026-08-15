#!/usr/bin/env python3
"""Turn a chroma-green painting of a rope into a horizontally seamless tile.

A swing line is drawn by repeating one strand texture along its length, so the
tile's right edge has to continue into its own left edge. Image generation will
paint a convincing rope but has no concept of a repeat, so the join is made
here: the tail is cross-faded over the head and then discarded, which leaves
two edges that were adjacent in the original painting and therefore match.
"""

import argparse
import sys
from pathlib import Path

from PIL import Image

sys.path.insert(0, str(Path(__file__).resolve().parents[2] / "scripts"))

from extract_sprite_components import key_chroma_green  # noqa: E402


def crop_to_content(source: Image.Image, threshold: int) -> Image.Image:
    bounds = source.getchannel("A").point(lambda v: 255 if v > threshold else 0).getbbox()
    if bounds is None:
        raise SystemExit("The source holds no visible rope.")
    # Keep the full painted width; only the empty backdrop above and below goes.
    return source.crop((0, bounds[1], source.width, bounds[3]))


def seamless(strip: Image.Image, overlap: int) -> Image.Image:
    width, height = strip.size
    if overlap * 2 >= width:
        raise SystemExit(f"Overlap {overlap} is too wide for a {width}px strip.")
    ramp = Image.linear_gradient("L").resize((overlap, height)).rotate(
        -90, expand=True
    ).resize((overlap, height))
    mixed = Image.composite(
        strip.crop((0, 0, overlap, height)),
        strip.crop((width - overlap, 0, width, height)),
        ramp,
    )
    tile = strip.crop((0, 0, width - overlap, height))
    tile.paste(mixed, (0, 0))
    return tile


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--input", required=True, type=Path)
    parser.add_argument("--out-dir", required=True, type=Path)
    parser.add_argument("--width", type=int, required=True)
    parser.add_argument("--height", type=int, required=True)
    parser.add_argument("--overlap", type=int, default=None)
    parser.add_argument("--chroma-softness", type=int, default=24)
    parser.add_argument("--alpha-threshold", type=int, default=8)
    args = parser.parse_args()

    source = key_chroma_green(
        Image.open(args.input).convert("RGBA"), args.chroma_softness
    )
    strip = crop_to_content(source, args.alpha_threshold)
    overlap = args.overlap if args.overlap is not None else strip.width // 6
    tile = seamless(strip, overlap).resize(
        (args.width, args.height), Image.Resampling.LANCZOS
    )
    args.out_dir.mkdir(parents=True, exist_ok=True)
    tile.save(args.out_dir / "01.png")
    print(f"{tile.size[0]}x{tile.size[1]} tile from a {strip.width}px strip")


if __name__ == "__main__":
    main()
