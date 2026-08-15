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


def parse_offsets(value: str) -> tuple[int, ...]:
    try:
        return tuple(int(part) for part in value.split(","))
    except ValueError as error:
        raise argparse.ArgumentTypeError(
            f"Expected comma-separated integers, received {value!r}."
        ) from error


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


def extract_columns(
    source: Image.Image,
    count: int,
    alpha_threshold: int,
) -> list[Image.Image]:
    """Split a strip into equal columns and crop each to its visible content.

    Seeded flood fill keeps only the one connected shape it lands on, which
    silently drops the loose droplets and detached strands that make a splat or
    a web mesh read as splatter. One subject per column has no such gaps.
    """
    width = source.width // count
    columns = []
    for index in range(count):
        column = source.crop((width * index, 0, width * (index + 1), source.height))
        visible = column.getchannel("A").point(
            lambda value: 255 if value > alpha_threshold else 0
        )
        bounds = visible.getbbox()
        if bounds is None:
            raise ValueError(f"Column {index} of {count} holds no visible content.")
        columns.append(column.crop(bounds))
    return columns


def normalize_frame(
    component: Image.Image,
    frame_size: int,
    scale: float,
    band: tuple[float, float] | None = None,
    hang_from_top: int | None = None,
    offset_y: int = 0,
    frame_height: int | None = None,
    centre: bool = False,
) -> Image.Image:
    frame_height = frame_height if frame_height is not None else frame_size
    width = max(1, round(component.width * scale))
    height = max(1, round(component.height * scale))
    if width > frame_size or height > frame_height:
        raise ValueError(
            f"Scale {scale} yields a {width}x{height} sprite that overflows a "
            f"{frame_size}x{frame_height} frame; lower --scale or --fit so every "
            f"pose stays in shared scale."
        )

    resized = component.resize((width, height), Image.Resampling.LANCZOS)
    shift = round(anchor_offset(component, band) * scale)
    left = (frame_size - width) // 2 - shift
    if hang_from_top is not None:
        baseline = hang_from_top
    elif centre:
        baseline = (frame_height - height) // 2
    else:
        baseline = frame_height - height
    top = baseline + offset_y
    if top < 0 or top + height > frame_height:
        raise ValueError(
            f"A {height}px pose placed at y={top} overflows a {frame_height}px "
            f"frame; lower --scale, --hang-from-top or --offset-y."
        )
    frame = Image.new("RGBA", (frame_size, frame_height))
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
    subjects = parser.add_mutually_exclusive_group(required=True)
    subjects.add_argument("--seed", action="append", type=parse_seed)
    subjects.add_argument(
        "--columns",
        type=int,
        default=None,
        help=(
            "Take one subject per equal-width column of the strip instead of flood "
            "filling from seeds. Keeps detached droplets and strands that a flood "
            "fill would drop."
        ),
    )
    parser.add_argument("--frame-size", type=int, default=192)
    parser.add_argument(
        "--frame-height",
        type=int,
        default=None,
        help="Frame height when it differs from --frame-size, e.g. 96 for a wide prop.",
    )
    scaling = parser.add_mutually_exclusive_group(required=True)
    scaling.add_argument("--scale", type=float)
    scaling.add_argument(
        "--fit",
        type=int,
        default=None,
        help=(
            "Scale every pose by the one factor that makes the widest seed's longest "
            "side this many pixels. Props have no shared character height to calibrate "
            "against, so state the on-frame size instead of guessing a scale."
        ),
    )
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
        "--centre",
        action="store_true",
        help=(
            "Centre every pose vertically instead of resting it on the frame floor. "
            "Use for props whose runtime origin is the sprite centre."
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
    parser.add_argument(
        "--offset-y",
        type=parse_offsets,
        default=(0,),
        help=(
            "Per-frame vertical nudge in output pixels, negative for up, cycled across "
            "the seeds, e.g. 0,-3,-5,-3. Registration otherwise pins every pose to the "
            "same line, which erases deliberate vertical motion such as a hover bob."
        ),
    )
    args = parser.parse_args()

    source = Image.open(args.input).convert("RGBA")
    if args.chroma_green:
        source = key_chroma_green(source, args.chroma_softness)
    args.out_dir.mkdir(parents=True, exist_ok=True)

    components = (
        extract_columns(source, args.columns, args.alpha_threshold)
        if args.columns is not None
        else [
            extract_component(source, seed, args.alpha_threshold) for seed in args.seed
        ]
    )
    scale = args.scale
    if scale is None:
        longest = max(max(item.width, item.height) for item in components)
        scale = args.fit / longest

    for offset, component in enumerate(components):
        frame = normalize_frame(
            component,
            args.frame_size,
            scale,
            args.anchor_band,
            args.hang_from_top,
            args.offset_y[offset % len(args.offset_y)],
            args.frame_height,
            args.centre,
        )
        frame.save(args.out_dir / f"{args.start_index + offset:02}.png")


if __name__ == "__main__":
    main()
