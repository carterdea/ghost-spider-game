#!/usr/bin/env python3

import argparse
from pathlib import Path

from PIL import Image, ImageChops, ImageDraw


def parse_seed(value: str) -> tuple[int, int]:
    try:
        x, y = value.split(",", maxsplit=1)
        return int(x), int(y)
    except ValueError as error:
        raise argparse.ArgumentTypeError(
            f"Expected a seed in x,y format, received {value!r}."
        ) from error


def extract_component(
    source: Image.Image,
    seed: tuple[int, int],
    alpha_threshold: int,
) -> Image.Image:
    alpha = source.getchannel("A")
    binary = alpha.point(lambda value: 255 if value > alpha_threshold else 0)
    if binary.getpixel(seed) == 0:
        raise ValueError(f"Seed {seed} does not land on visible sprite content.")

    ImageDraw.floodfill(binary, seed, 128, thresh=0)
    selected = binary.point(lambda value: 255 if value == 128 else 0)
    bounds = selected.getbbox()
    if bounds is None:
        raise ValueError(f"Seed {seed} did not select a sprite component.")

    component = source.copy()
    component.putalpha(ImageChops.multiply(alpha, selected))
    return component.crop(bounds)


def normalize_frame(
    component: Image.Image,
    frame_size: int,
    scale: float,
) -> Image.Image:
    width = max(1, round(component.width * scale))
    height = max(1, round(component.height * scale))
    if width > frame_size or height > frame_size:
        fit = min(frame_size / width, frame_size / height)
        width = max(1, round(width * fit))
        height = max(1, round(height * fit))

    resized = component.resize((width, height), Image.Resampling.LANCZOS)
    frame = Image.new("RGBA", (frame_size, frame_size))
    frame.alpha_composite(resized, ((frame_size - width) // 2, frame_size - height))
    return frame


def main() -> None:
    parser = argparse.ArgumentParser(
        description=(
            "Extract seeded alpha components into shared-scale, bottom-centered frames."
        )
    )
    parser.add_argument("--input", required=True, type=Path)
    parser.add_argument("--out-dir", required=True, type=Path)
    parser.add_argument("--seed", action="append", required=True, type=parse_seed)
    parser.add_argument("--frame-size", type=int, default=192)
    parser.add_argument("--scale", type=float, required=True)
    parser.add_argument("--alpha-threshold", type=int, default=8)
    args = parser.parse_args()

    source = Image.open(args.input).convert("RGBA")
    args.out_dir.mkdir(parents=True, exist_ok=True)

    for index, seed in enumerate(args.seed, start=1):
        component = extract_component(source, seed, args.alpha_threshold)
        frame = normalize_frame(component, args.frame_size, args.scale)
        frame.save(args.out_dir / f"{index:02}.png")


if __name__ == "__main__":
    main()
