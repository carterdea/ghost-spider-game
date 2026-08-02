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


def parse_band(value: str) -> tuple[float, float]:
    try:
        low, high = (float(part) for part in value.split(",", maxsplit=1))
    except ValueError as error:
        raise argparse.ArgumentTypeError(
            f"Expected a band in low,high format, received {value!r}."
        ) from error
    if not 0.0 <= low < high <= 1.0:
        raise argparse.ArgumentTypeError(
            f"Expected 0 <= low < high <= 1, received {value!r}."
        )
    return low, high


def key_chroma_green(source: Image.Image, softness: int) -> Image.Image:
    """Replace a flat green backdrop with alpha and remove green spill."""
    red, green, blue = source.split()[:3]
    ceiling = ImageChops.lighter(red, blue)
    excess = ImageChops.subtract(green, ceiling)
    cutoff = max(1, softness * 2)
    alpha = excess.point(lambda value: max(0, 255 - value * 255 // cutoff))
    return Image.merge("RGBA", (red, ImageChops.darker(green, ceiling), blue, alpha))


def anchor_offset(component: Image.Image, band: tuple[float, float] | None) -> int:
    """Horizontal distance from the component centre to its registration point."""
    if band is None:
        return 0
    low, high = band
    top = round(component.height * low)
    bottom = max(top + 1, round(component.height * high))
    slice_bounds = component.crop((0, top, component.width, bottom)).getbbox()
    if slice_bounds is None:
        return 0
    band_centre = (slice_bounds[0] + slice_bounds[2]) / 2
    return round(band_centre - component.width / 2)


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
    band: tuple[float, float] | None = None,
    hang_from_top: int | None = None,
) -> Image.Image:
    width = max(1, round(component.width * scale))
    height = max(1, round(component.height * scale))
    if width > frame_size or height > frame_size:
        raise ValueError(
            f"Scale {scale} yields a {width}x{height} sprite that overflows a "
            f"{frame_size}px frame; lower --scale so every pose stays in shared scale."
        )

    resized = component.resize((width, height), Image.Resampling.LANCZOS)
    shift = round(anchor_offset(component, band) * scale)
    left = (frame_size - width) // 2 - shift
    top = hang_from_top if hang_from_top is not None else frame_size - height
    if top + height > frame_size:
        raise ValueError(
            f"A {height}px pose hung {hang_from_top}px from the top overflows a "
            f"{frame_size}px frame; lower --scale or --hang-from-top."
        )
    frame = Image.new("RGBA", (frame_size, frame_size))
    frame.paste(resized, (left, top), resized)
    return frame


def main() -> None:
    parser = argparse.ArgumentParser(
        description=(
            "Extract seeded sprite poses into shared-scale, consistently registered "
            "frames. Poses rest on the frame floor and centre on their bounding box "
            "unless --hang-from-top or --anchor-band pick a different registration."
        )
    )
    parser.add_argument("--input", required=True, type=Path)
    parser.add_argument("--out-dir", required=True, type=Path)
    parser.add_argument("--seed", action="append", required=True, type=parse_seed)
    parser.add_argument("--frame-size", type=int, default=192)
    parser.add_argument("--scale", type=float, required=True)
    parser.add_argument("--alpha-threshold", type=int, default=8)
    parser.add_argument("--start-index", type=int, default=1)
    parser.add_argument(
        "--chroma-green",
        action="store_true",
        help="Key out a flat green backdrop instead of trusting the source alpha.",
    )
    parser.add_argument("--chroma-softness", type=int, default=24)
    parser.add_argument(
        "--anchor-band",
        type=parse_band,
        default=None,
        help=(
            "Vertical band (low,high as fractions of the pose height) whose horizontal "
            "midpoint registers every frame, e.g. 0.42,0.58 for the hips. Defaults to "
            "the pose bounding-box centre."
        ),
    )
    parser.add_argument(
        "--hang-from-top",
        type=int,
        default=None,
        help=(
            "Pin the top of every pose this many pixels below the frame top instead of "
            "resting it on the frame floor. Use for hanging poses such as a web swing, "
            "where the raised fist is the anchor and the feet are not."
        ),
    )
    args = parser.parse_args()

    source = Image.open(args.input).convert("RGBA")
    if args.chroma_green:
        source = key_chroma_green(source, args.chroma_softness)
    args.out_dir.mkdir(parents=True, exist_ok=True)

    for offset, seed in enumerate(args.seed):
        component = extract_component(source, seed, args.alpha_threshold)
        frame = normalize_frame(
            component,
            args.frame_size,
            args.scale,
            args.anchor_band,
            args.hang_from_top,
        )
        frame.save(args.out_dir / f"{args.start_index + offset:02}.png")


if __name__ == "__main__":
    main()
