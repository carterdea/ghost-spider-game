/**
 * How much world a frame shows, whatever shape the window is.
 *
 * The canvas is the window — `main.ts` scales with `RESIZE`, so nothing is ever
 * letterboxed — which leaves the camera's zoom to do the framing. The rule is
 * one line: every window is guaranteed `MIN_VIEW`, whatever it has left over is
 * spent on more world rather than on black bars, and no frame ever reveals more
 * than `MAX_VIEW` or more than the level actually contains.
 *
 * On a side-scroller the leftover is usually width, and seeing further down the
 * block is a gift rather than a problem. The cap is what stops a very wide or
 * very short window from pulling back until the hero is a speck — and it is the
 * span the parallax layers are laid out across, so it has to be a real bound
 * rather than a hope.
 *
 * Pure arithmetic on sizes: no Phaser, so the framing is testable on its own.
 */

export interface Size {
  readonly width: number;
  readonly height: number;
}

/** The frame every window is guaranteed, on both axes: the authored size. */
export const MIN_VIEW: Size = { width: 1280, height: 720 };

/**
 * The most world one frame may reveal, however extreme the window: the authored
 * frame and a half again on each axis. Every window shape a player can produce
 * short of a letterbox slot stays well inside it.
 */
export const MAX_VIEW: Size = { width: 2880, height: 1620 };

const isDrawable = (size: Size): boolean =>
  Number.isFinite(size.width) &&
  Number.isFinite(size.height) &&
  size.width > 0 &&
  size.height > 0;

/** The zoom at which `viewport` shows `world` and no more of it. */
const cover = (viewport: Size, world: Size): number =>
  Math.max(viewport.width / world.width, viewport.height / world.height);

/**
 * Camera zoom for a window of `viewport` device-independent pixels playing a
 * `level`-sized world. `ease` is the speed pull-back the scene applies on top,
 * in (0, 1]: 1 is the resting frame, lower shows more.
 */
export const frameZoom = (viewport: Size, level: Size, ease = 1): number => {
  if (!isDrawable(viewport) || !isDrawable(level)) {
    return 1;
  }
  const fit = Math.min(
    viewport.width / MIN_VIEW.width,
    viewport.height / MIN_VIEW.height,
  );
  // The floors win over the ease: pulling back past the level's own edge would
  // show the void beyond it, and past `MAX_VIEW` would run the backdrop out.
  return Math.max(
    fit * ease,
    cover(viewport, MAX_VIEW),
    cover(viewport, level),
  );
};

/** The world `viewport` shows at `zoom`, which is what the camera frames. */
export const viewSize = (viewport: Size, zoom: number): Size => ({
  width: viewport.width / zoom,
  height: viewport.height / zoom,
});
