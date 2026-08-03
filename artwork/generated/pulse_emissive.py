#!/usr/bin/env python3
"""Breathe the neon on a chroma-green sprite strip, column by column.

Image generation reliably matches a character's palette and silhouette but will
not hold a light source steady across a cycle, so the emissive pass is applied
here instead: each column is multiplied by its own gain, weighted towards the
saturated, bright pixels that read as neon. The hull, the panel shading and the
chroma backdrop are left alone.
"""

import argparse
from pathlib import Path

from PIL import Image, ImageChops


def parse_gains(value: str) -> tuple[float, ...]:
    try:
        gains = tuple(float(part) for part in value.split(","))
    except ValueError as error:
        raise argparse.ArgumentTypeError(
            f"Expected comma-separated floats, received {value!r}."
        ) from error
    if not gains:
        raise argparse.ArgumentTypeError("Expected at least one gain.")
    return gains


def neon_weight(column: Image.Image) -> Image.Image:
    """Per-pixel 0-255 mask of how strongly a pixel reads as an emissive accent.

    Neon is what is both saturated and bright; the chroma backdrop is saturated
    but excluded, and the hull is neither.
    """
    red, green, blue = column.split()[:3]
    peak = ImageChops.lighter(ImageChops.lighter(red, green), blue)
    floor = ImageChops.darker(ImageChops.darker(red, green), blue)
    saturation = ImageChops.subtract(peak, floor)
    backdrop = ImageChops.subtract(green, ImageChops.lighter(red, blue))
    weight = ImageChops.multiply(saturation, peak.point(lambda v: min(255, v * 2)))
    return ImageChops.subtract(weight, backdrop.point(lambda v: min(255, v * 8)))


def pulse_column(column: Image.Image, gain: float) -> Image.Image:
    if gain == 1.0:
        return column
    weight = neon_weight(column)
    scaled = column.point(lambda v: max(0, min(255, round(v * gain))))
    return Image.composite(scaled, column, weight)


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--input", required=True, type=Path)
    parser.add_argument("--output", required=True, type=Path)
    parser.add_argument("--columns", type=int, required=True)
    parser.add_argument(
        "--gains",
        type=parse_gains,
        required=True,
        help="One brightness multiplier per column, e.g. 1.2,1.0,0.8,1.0.",
    )
    args = parser.parse_args()

    if len(args.gains) != args.columns:
        raise SystemExit(
            f"Expected {args.columns} gains, received {len(args.gains)}."
        )

    source = Image.open(args.input).convert("RGB")
    width = source.width // args.columns
    strip = Image.new("RGB", source.size)
    for index, gain in enumerate(args.gains):
        box = (width * index, 0, width * (index + 1), source.height)
        strip.paste(pulse_column(source.crop(box), gain), box)
    strip.save(args.output)


if __name__ == "__main__":
    main()
