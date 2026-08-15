import type Phaser from "phaser";

/**
 * The shape of a single web strand, and how it is stroked.
 *
 * A strand is sampled once into module-level scratch arrays and then stroked
 * from them. Nothing here allocates: the live swing line is retraced every
 * frame, and a per-frame array or point object would be a garbage generator
 * sitting in the hot path.
 *
 * `traceStrand` is pure geometry and is tested directly, without a Graphics.
 */

const TAU = Math.PI * 2;

/**
 * Straight spans between samples. Even, so one sample lands on mid-span, and
 * high enough that the braid below resolves as a curve rather than as kinks.
 */
const SEGMENTS = 24;

export const STRAND_SAMPLES = SEGMENTS + 1;

/**
 * Bands the core is stroked in. Phaser strokes a whole path at one width, so
 * the taper is faked by stroking a handful of runs. Four reads as a smooth
 * taper and costs a quarter of the style changes a per-segment one would.
 */
const BANDS = 4;
const SEGMENTS_PER_BAND = SEGMENTS / BANDS;

/** Turns of the braid across the span. */
const BRAID_TURNS = 3;

/**
 * How much a strand hanging straight down still buckles sideways. Slack falls
 * under gravity, so the bow follows the part of "down" the strand cannot take
 * up along its own length — which for a vertical strand is none of it, and it
 * would stay ruler-straight however loose it was.
 */
const MIN_LEAN = 0.35;

/** Width at the anchor as a fraction of the width at the hand. */
const ANCHOR_WIDTH = 0.42;

/** Width of the glow laid under the core, as a multiple of the core width. */
const GLOW_WIDTH = 3.4;
const GLOW_ALPHA = 0.16;

/** Cross-ticks every this many samples, which is what reads as webbing. */
const TICK_SPACING = 4;

/** Bow beyond this fraction of the span reads as a dropped line, not as slack. */
const MAX_SAG = 0.3;

/** Turns slack in px into a bow in px, under the root below. */
const SAG_GAIN = 0.55;

/**
 * The bow a slack strand hangs in. `slack` is the rope length the solver holds
 * minus how far the hero actually is from the anchor, so it is zero the instant
 * the line goes taut and the strand snaps straight on its own.
 *
 * Rooted rather than linear: a real catenary deepens fast off zero and then
 * flattens out, which is what makes the last few pixels of a line going taut
 * read as a snap.
 */
export const sagFor = (slack: number, span: number): number => {
  if (!(slack > 0)) {
    return 0;
  }
  return Math.min(span * MAX_SAG, Math.sqrt(slack * span) * SAG_GAIN);
};

export interface StrandStyle {
  core: number;
  /** District accent, laid under the core as a soft glow. */
  glow: number;
  highlight: number;
  alpha: number;
  /** Stroke width at the hand end. */
  width: number;
}

/**
 * The last traced strand. Overwritten by every `traceStrand`, so read it before
 * tracing the next one.
 */
export const strand = {
  x: new Float64Array(STRAND_SAMPLES),
  y: new Float64Array(STRAND_SAMPLES),
  /** Unit normal of the anchor-to-hand line. */
  normalX: 0,
  normalY: 0,
  /** Straight-line distance from anchor to hand, in px. */
  span: 0,
};

/**
 * Samples the strand running from the anchor to the hand.
 *
 * `sag` is the bow at mid-span in px: zero draws the dead-straight line of a
 * rope under load. `braid` is the amplitude of the twist across the line, and
 * `phase` crawls it along.
 */
export const traceStrand = (
  anchorX: number,
  anchorY: number,
  handX: number,
  handY: number,
  sag: number,
  braid: number,
  phase: number,
): void => {
  const dx = handX - anchorX;
  const dy = handY - anchorY;
  const span = Math.max(1, Math.hypot(dx, dy));
  const normalX = -dy / span;
  const normalY = dx / span;

  strand.normalX = normalX;
  strand.normalY = normalY;
  strand.span = span;

  const lean =
    normalY >= 0 ? Math.max(normalY, MIN_LEAN) : Math.min(normalY, -MIN_LEAN);

  for (let index = 0; index < STRAND_SAMPLES; index += 1) {
    const t = index / SEGMENTS;
    // Peaks at mid-span and vanishes at both ends, where the strand is pinned.
    const bow = 4 * t * (1 - t);
    const offset =
      Math.sin(t * BRAID_TURNS * TAU + phase) * bow * braid + sag * bow * lean;
    strand.x[index] = anchorX + dx * t + normalX * offset;
    strand.y[index] = anchorY + dy * t + normalY * offset;
  }
};

/** Strokes whatever `traceStrand` last sampled. */
export const strokeStrand = (
  graphics: Phaser.GameObjects.Graphics,
  style: StrandStyle,
): void => {
  if (style.alpha <= 0 || style.width <= 0) {
    return;
  }

  strokeGlow(graphics, style);
  strokeCore(graphics, style);
  strokeHighlight(graphics, style);
  strokeTicks(graphics, style);
};

const strokeRun = (
  graphics: Phaser.GameObjects.Graphics,
  from: number,
  to: number,
  offset: number,
): void => {
  const { x, y, normalX, normalY } = strand;
  graphics.beginPath();
  graphics.moveTo(x[from] + normalX * offset, y[from] + normalY * offset);
  for (let index = from + 1; index <= to; index += 1) {
    graphics.lineTo(x[index] + normalX * offset, y[index] + normalY * offset);
  }
  graphics.strokePath();
};

const strokeGlow = (
  graphics: Phaser.GameObjects.Graphics,
  style: StrandStyle,
): void => {
  graphics.lineStyle(
    style.width * GLOW_WIDTH,
    style.glow,
    style.alpha * GLOW_ALPHA,
  );
  strokeRun(graphics, 0, SEGMENTS, 0);
};

/** Thin where it is stuck to the world, thick where it leaves the fist. */
const strokeCore = (
  graphics: Phaser.GameObjects.Graphics,
  style: StrandStyle,
): void => {
  for (let band = 0; band < BANDS; band += 1) {
    const from = band * SEGMENTS_PER_BAND;
    const to = from + SEGMENTS_PER_BAND;
    const middle = (from + to) / 2 / SEGMENTS;
    graphics.lineStyle(
      style.width * (ANCHOR_WIDTH + (1 - ANCHOR_WIDTH) * middle),
      style.core,
      style.alpha,
    );
    strokeRun(graphics, from, to, 0);
  }
};

/** One lit edge, riding the braid, so the strand reads as round rather than flat. */
const strokeHighlight = (
  graphics: Phaser.GameObjects.Graphics,
  style: StrandStyle,
): void => {
  graphics.lineStyle(1, style.highlight, style.alpha * 0.5);
  strokeRun(graphics, 0, SEGMENTS, -style.width * 0.34);
};

const strokeTicks = (
  graphics: Phaser.GameObjects.Graphics,
  style: StrandStyle,
): void => {
  const { x, y, normalX, normalY } = strand;
  const reach = style.width * 1.5;
  graphics.lineStyle(1, style.core, style.alpha * 0.42);
  for (let index = TICK_SPACING; index < SEGMENTS; index += TICK_SPACING) {
    const side = index % (TICK_SPACING * 2) === 0 ? 1 : -1;
    graphics.lineBetween(
      x[index],
      y[index],
      x[index] + normalX * reach * side,
      y[index] + normalY * reach * side,
    );
  }
};
