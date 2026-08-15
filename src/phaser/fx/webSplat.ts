import type Phaser from "phaser";

/**
 * The webbing that lands on things: the spray where a swing line is stuck to
 * the world, and the sticky patch a glob or a net leaves behind.
 *
 * Both are drawn from a seed rather than from stored randomness, so a splat
 * costs one integer to remember and looks the same on every frame it is drawn.
 * Nothing here allocates.
 */

const TAU = Math.PI * 2;

/** Deterministic 0..1 from a seed. Same input, same splat, every frame. */
const noise = (seed: number): number => {
  const value = Math.sin(seed * 12.9898 + 78.233) * 43758.5453;
  return value - Math.floor(value);
};

/** Spurs in an anchor spray. */
const SPRAY_SPURS = 7;

/**
 * The knot where a swing line meets geometry: a soft halo, a hard core, and a
 * few spurs of over-spray, so the line reads as stuck rather than floating.
 */
export const drawAnchorSpray = (
  graphics: Phaser.GameObjects.Graphics,
  x: number,
  y: number,
  seed: number,
  core: number,
  glow: number,
  alpha: number,
  scale: number,
): void => {
  graphics.fillStyle(glow, alpha * 0.16);
  graphics.fillCircle(x, y, 9 * scale);
  graphics.fillStyle(core, alpha * 0.9);
  graphics.fillCircle(x, y, 3.1 * scale);

  graphics.lineStyle(1.4, core, alpha * 0.66);
  for (let spur = 0; spur < SPRAY_SPURS; spur += 1) {
    const angle = (TAU * spur) / SPRAY_SPURS + noise(seed + spur) * 0.7;
    const reach = (5 + noise(seed - spur) * 7) * scale;
    graphics.lineBetween(
      x,
      y,
      x + Math.cos(angle) * reach,
      y + Math.sin(angle) * reach,
    );
  }
};

const BLOBS = 3;

/** Spokes in a splat. The rings strung between them are what read as a web. */
const SPOKES = 7;

/** Rings, as a fraction of each spoke's own reach. */
const RINGS = [0.42, 0.78] as const;

const spokeAngle = (seed: number, index: number): number =>
  (TAU * index) / SPOKES + noise(seed + index) * 0.55;

/** Ragged on purpose: even spokes read as a snowflake, not as thrown webbing. */
const spokeReach = (seed: number, index: number, grown: number): number =>
  grown * (0.55 + noise(seed * 2 + index) * 0.75);

/**
 * A patch of webbing stuck to something it was fired at. `spread` runs 0 at the
 * moment of impact to 1 once it has finished flowering, and `alpha` fades it
 * out; the whole patch droops further as it goes, which is what reads as sticky
 * rather than as a decal.
 */
export const drawSplat = (
  graphics: Phaser.GameObjects.Graphics,
  x: number,
  y: number,
  radius: number,
  seed: number,
  spread: number,
  alpha: number,
  core: number,
  glow: number,
): void => {
  const grown = radius * (0.45 + 0.55 * spread);
  const droop = grown * 0.3 * spread;

  graphics.fillStyle(glow, alpha * 0.07);
  graphics.fillCircle(x, y + droop * 0.3, grown * 0.95);

  graphics.fillStyle(core, alpha * 0.22);
  for (let blob = 0; blob < BLOBS; blob += 1) {
    const angle = noise(seed + blob * 3) * TAU;
    graphics.fillCircle(
      x + Math.cos(angle) * grown * 0.26,
      y + Math.sin(angle) * grown * 0.26,
      grown * (0.2 + noise(seed - blob) * 0.16),
    );
  }

  graphics.lineStyle(1.5, core, alpha * 0.8);
  for (let index = 0; index < SPOKES; index += 1) {
    const angle = spokeAngle(seed, index);
    const reach = spokeReach(seed, index, grown);
    graphics.lineBetween(
      x,
      y,
      x + Math.cos(angle) * reach,
      y + Math.sin(angle) * reach + droop,
    );
  }

  graphics.lineStyle(1, core, alpha * 0.55);
  for (const ring of RINGS) {
    for (let index = 0; index < SPOKES; index += 1) {
      const next = (index + 1) % SPOKES;
      const here = spokeReach(seed, index, grown) * ring;
      const there = spokeReach(seed, next, grown) * ring;
      const fromAngle = spokeAngle(seed, index);
      const toAngle = spokeAngle(seed, next);
      graphics.lineBetween(
        x + Math.cos(fromAngle) * here,
        y + Math.sin(fromAngle) * here + droop * ring,
        x + Math.cos(toAngle) * there,
        y + Math.sin(toAngle) * there + droop * ring,
      );
    }
  }
};
