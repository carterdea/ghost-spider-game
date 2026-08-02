import { describe, expect, test } from "bun:test";
import type { Vec2 } from "../physics/vector";
import {
  DEFAULT_SWING_TUNING,
  isTaut,
  type Rope,
  ropeLengthFor,
  type SwingBody,
  type SwingInput,
  type SwingTuning,
  stepSwing,
} from "./swing";

const ANCHOR: Vec2 = { x: 0, y: 0 };
const ROPE_LENGTH = 300;
const HOLD: SwingInput = { reel: 0, pump: 0 };

const frictionless: SwingTuning = { ...DEFAULT_SWING_TUNING, drag: 1 };

const rope = (length = ROPE_LENGTH, anchor: Vec2 = ANCHOR): Rope => ({
  anchor,
  length,
});

/** Hero held out sideways from the anchor, rope taut, at rest. */
const releasedFromHorizontal = (): SwingBody => ({
  position: { x: ROPE_LENGTH, y: 0 },
  velocity: { x: 0, y: 0 },
});

const speedOf = (body: SwingBody): number =>
  Math.hypot(body.velocity.x, body.velocity.y);

const reachOf = (body: SwingBody, line: Rope): number =>
  Math.hypot(body.position.x - line.anchor.x, body.position.y - line.anchor.y);

/** Energy per unit mass. Gravity points +y, so potential is -g * y. */
const energyOf = (body: SwingBody, tuning: SwingTuning): number =>
  0.5 * speedOf(body) ** 2 - tuning.gravity * body.position.y;

const simulate = (
  body: SwingBody,
  line: Rope,
  input: SwingInput,
  tuning: SwingTuning,
  dt: number,
  frames: number,
  onFrame?: (body: SwingBody, line: Rope) => void,
): { body: SwingBody; rope: Rope } => {
  let state = { body, rope: line };
  for (let frame = 0; frame < frames; frame += 1) {
    state = stepSwing(state.body, state.rope, input, tuning, dt);
    onFrame?.(state.body, state.rope);
  }
  return state;
};

describe("ropeLengthFor", () => {
  test("uses the current distance to the anchor", () => {
    expect(
      ropeLengthFor({ x: 0, y: 400 }, ANCHOR, DEFAULT_SWING_TUNING),
    ).toBeCloseTo(400, 10);
  });

  test("clamps to the tuned rope range", () => {
    expect(ropeLengthFor({ x: 0, y: 5000 }, ANCHOR, DEFAULT_SWING_TUNING)).toBe(
      DEFAULT_SWING_TUNING.maxRopeLength,
    );
    expect(ropeLengthFor({ x: 0, y: 1 }, ANCHOR, DEFAULT_SWING_TUNING)).toBe(
      DEFAULT_SWING_TUNING.minRopeLength,
    );
  });
});

describe("isTaut", () => {
  test("is false inside the circle and true at or beyond it", () => {
    const line = rope();
    expect(isTaut({ position: { x: 0, y: 299 }, velocity: ANCHOR }, line)).toBe(
      false,
    );
    expect(isTaut({ position: { x: 0, y: 300 }, velocity: ANCHOR }, line)).toBe(
      true,
    );
    expect(isTaut({ position: { x: 0, y: 900 }, velocity: ANCHOR }, line)).toBe(
      true,
    );
  });
});

describe("pendulum motion", () => {
  test("conserves energy over a long frictionless swing", () => {
    const start = releasedFromHorizontal();
    const reference = energyOf(start, frictionless);
    const scale = frictionless.gravity * ROPE_LENGTH;
    let worstDrift = 0;

    simulate(start, rope(), HOLD, frictionless, 1 / 60, 600, (body) => {
      worstDrift = Math.max(
        worstDrift,
        Math.abs(energyOf(body, frictionless) - reference),
      );
    });

    // 600 frames is ~10 s, roughly three full swings.
    expect(worstDrift / scale).toBeLessThan(1e-3);
  });

  test("reaches the analytic bottom-of-arc speed and keeps it on release", () => {
    let fastest = 0;
    simulate(
      releasedFromHorizontal(),
      rope(),
      HOLD,
      frictionless,
      1 / 120,
      200,
      (body) => {
        fastest = Math.max(fastest, speedOf(body));
      },
    );

    const analytic = Math.sqrt(2 * frictionless.gravity * ROPE_LENGTH);
    expect(fastest).toBeGreaterThan(analytic * 0.999);
    expect(fastest).toBeLessThanOrEqual(analytic);
  });

  test("swings to the same amplitude on the far side", () => {
    let extreme = 0;
    let lowest = 0;
    simulate(
      releasedFromHorizontal(),
      rope(),
      HOLD,
      frictionless,
      1 / 120,
      240,
      (body) => {
        extreme = Math.min(extreme, body.position.x);
        lowest = Math.max(lowest, body.position.y);
      },
    );

    expect(lowest).toBeCloseTo(ROPE_LENGTH, 1);
    expect(extreme).toBeLessThan(-ROPE_LENGTH * 0.999);
    // Never above the anchor: a real pendulum cannot gain energy.
    expect(extreme).toBeGreaterThanOrEqual(-ROPE_LENGTH);
  });

  test("leaves no outward radial velocity after a taut step", () => {
    let worstRadial = 0;
    simulate(
      releasedFromHorizontal(),
      rope(),
      HOLD,
      frictionless,
      1 / 60,
      300,
      (body, line) => {
        const reach = reachOf(body, line);
        const radial =
          (body.velocity.x * (body.position.x - line.anchor.x) +
            body.velocity.y * (body.position.y - line.anchor.y)) /
          reach;
        worstRadial = Math.max(worstRadial, Math.abs(radial));
      },
    );

    expect(worstRadial).toBeLessThan(1e-6);
  });

  test("drag below 1 bleeds energy, drag of 1 does not", () => {
    const damped: SwingTuning = { ...DEFAULT_SWING_TUNING, drag: 0.9 };
    const withDrag = simulate(
      releasedFromHorizontal(),
      rope(),
      HOLD,
      damped,
      1 / 60,
      300,
    );
    const without = simulate(
      releasedFromHorizontal(),
      rope(),
      HOLD,
      frictionless,
      1 / 60,
      300,
    );

    expect(energyOf(withDrag.body, damped)).toBeLessThan(
      energyOf(without.body, frictionless) - 1000,
    );
  });
});

describe("rope constraint", () => {
  test("never stretches past its length across a chaotic run", () => {
    const dts = [1 / 240, 1 / 60, 1 / 12, 0.3];
    const inputs: SwingInput[] = [
      { reel: 0, pump: 0 },
      { reel: -1, pump: 1 },
      { reel: 1, pump: 0 },
      { reel: 0, pump: -1 },
      { reel: 1, pump: 1 },
    ];
    let state = {
      body: {
        position: { x: 240, y: -180 },
        velocity: { x: 900, y: -400 },
      },
      rope: rope(),
    };
    let worstStretch = 0;
    // Deterministic pseudo-random schedule: no Math.random in a physics test.
    let seed = 12345;

    for (let frame = 0; frame < 800; frame += 1) {
      seed = (seed * 1103515245 + 12345) % 2147483648;
      const dt = dts[seed % dts.length] ?? 1 / 60;
      const input = inputs[(seed >> 8) % inputs.length] ?? HOLD;
      state = stepSwing(
        state.body,
        state.rope,
        input,
        DEFAULT_SWING_TUNING,
        dt,
      );
      worstStretch = Math.max(
        worstStretch,
        reachOf(state.body, state.rope) - state.rope.length,
      );
      expect(Number.isFinite(state.body.position.x)).toBe(true);
    }

    expect(worstStretch).toBeLessThan(1e-6);
  });

  test("a slack rope is inert: motion is exactly projectile motion", () => {
    const start: SwingBody = {
      position: { x: 0, y: -100 },
      velocity: { x: 200, y: -300 },
    };
    const elapsed = 0.4;
    const frames = 24;
    const { body, rope: line } = simulate(
      start,
      rope(400),
      HOLD,
      frictionless,
      elapsed / frames,
      frames,
    );

    const g = frictionless.gravity;
    expect(body.position.x).toBeCloseTo(
      start.position.x + start.velocity.x * elapsed,
      6,
    );
    expect(body.position.y).toBeCloseTo(
      start.position.y + start.velocity.y * elapsed + 0.5 * g * elapsed ** 2,
      6,
    );
    expect(body.velocity.x).toBeCloseTo(start.velocity.x, 9);
    expect(body.velocity.y).toBeCloseTo(start.velocity.y + g * elapsed, 6);
    expect(reachOf(body, line)).toBeLessThan(line.length);
  });

  test("survives a huge dt without exploding", () => {
    let state = { body: releasedFromHorizontal(), rope: rope() };
    for (let frame = 0; frame < 20; frame += 1) {
      state = stepSwing(
        state.body,
        state.rope,
        { reel: 0, pump: 1 },
        DEFAULT_SWING_TUNING,
        0.5,
      );
      expect(Number.isFinite(state.body.position.x)).toBe(true);
      expect(Number.isFinite(state.body.position.y)).toBe(true);
      expect(Number.isFinite(state.body.velocity.x)).toBe(true);
      expect(Number.isFinite(state.body.velocity.y)).toBe(true);
      expect(reachOf(state.body, state.rope)).toBeLessThan(
        state.rope.length + 1e-6,
      );
      expect(speedOf(state.body)).toBeLessThanOrEqual(
        DEFAULT_SWING_TUNING.maxSpeed + 1e-6,
      );
    }
  });

  test("ignores a non-positive dt", () => {
    const start = releasedFromHorizontal();
    const held = stepSwing(start, rope(), HOLD, DEFAULT_SWING_TUNING, 0);

    expect(held.body).toEqual(start);
    expect(held.rope.length).toBe(ROPE_LENGTH);
  });
});

describe("pumping", () => {
  const swungFor = (pump: number): SwingBody =>
    simulate(
      releasedFromHorizontal(),
      rope(),
      { reel: 0, pump },
      frictionless,
      1 / 60,
      300,
    ).body;

  test("forward pumping adds energy and backward pumping removes it", () => {
    const coasting = energyOf(swungFor(0), frictionless);
    const forward = energyOf(swungFor(1), frictionless);
    const backward = energyOf(swungFor(-1), frictionless);

    expect(forward).toBeGreaterThan(coasting + 1e5);
    expect(backward).toBeLessThan(coasting - 1e5);
  });

  test("does nothing while the rope is slack", () => {
    const start: SwingBody = {
      position: { x: 0, y: -100 },
      velocity: { x: 200, y: 0 },
    };
    const pumped = simulate(
      start,
      rope(400),
      { reel: 0, pump: 1 },
      frictionless,
      1 / 60,
      6,
    ).body;
    const coasting = simulate(
      start,
      rope(400),
      HOLD,
      frictionless,
      1 / 60,
      6,
    ).body;

    expect(pumped).toEqual(coasting);
  });
});

describe("reeling", () => {
  test("shortens and lengthens at the tuned reel speed", () => {
    const start = { position: { x: 400, y: 0 }, velocity: { x: 0, y: 0 } };
    const reeledIn = stepSwing(
      start,
      rope(400),
      { reel: -1, pump: 0 },
      DEFAULT_SWING_TUNING,
      0.5,
    );
    const letOut = stepSwing(
      start,
      rope(400),
      { reel: 1, pump: 0 },
      DEFAULT_SWING_TUNING,
      0.5,
    );

    const travel = DEFAULT_SWING_TUNING.reelSpeed * 0.5;
    expect(reeledIn.rope.length).toBeCloseTo(400 - travel, 6);
    expect(letOut.rope.length).toBeCloseTo(400 + travel, 6);
  });

  test("clamps to the tuned rope length range", () => {
    const start = { position: { x: 400, y: 0 }, velocity: { x: 0, y: 0 } };
    const shortest = simulate(
      start,
      rope(400),
      { reel: -1, pump: 0 },
      DEFAULT_SWING_TUNING,
      1 / 60,
      600,
    );
    const longest = simulate(
      start,
      rope(400),
      { reel: 1, pump: 0 },
      DEFAULT_SWING_TUNING,
      1 / 60,
      600,
    );

    expect(shortest.rope.length).toBe(DEFAULT_SWING_TUNING.minRopeLength);
    expect(longest.rope.length).toBe(DEFAULT_SWING_TUNING.maxRopeLength);
  });

  test("reeling in drags the hero onto the shorter rope", () => {
    const start = { position: { x: 400, y: 0 }, velocity: { x: 0, y: 0 } };
    const { body, rope: line } = stepSwing(
      start,
      rope(400),
      { reel: -1, pump: 0 },
      DEFAULT_SWING_TUNING,
      0.25,
    );

    expect(reachOf(body, line)).toBeLessThanOrEqual(line.length + 1e-6);
  });
});

describe("determinism and purity", () => {
  test("is frame-rate independent", () => {
    // A fixedStep that neither frame rate divides evenly, so the two runs
    // really do use different sub-step sizes.
    const tuning: SwingTuning = { ...frictionless, fixedStep: 1 / 70 };
    const coarse = simulate(
      releasedFromHorizontal(),
      rope(),
      HOLD,
      tuning,
      1 / 30,
      60,
    ).body;
    const fine = simulate(
      releasedFromHorizontal(),
      rope(),
      HOLD,
      tuning,
      1 / 60,
      120,
    ).body;

    expect(fine.position.x).toBeCloseTo(coarse.position.x, 0);
    expect(fine.position.y).toBeCloseTo(coarse.position.y, 0);
    expect(Math.abs(fine.velocity.x - coarse.velocity.x)).toBeLessThan(3);
    expect(Math.abs(fine.velocity.y - coarse.velocity.y)).toBeLessThan(3);
  });

  test("repeats exactly for identical inputs", () => {
    const start = releasedFromHorizontal();
    const first = stepSwing(
      start,
      rope(),
      { reel: -1, pump: 1 },
      DEFAULT_SWING_TUNING,
      1 / 60,
    );
    const second = stepSwing(
      start,
      rope(),
      { reel: -1, pump: 1 },
      DEFAULT_SWING_TUNING,
      1 / 60,
    );

    expect(first).toEqual(second);
  });

  test("never mutates its arguments", () => {
    const body: SwingBody = {
      position: Object.freeze({ x: 220, y: -40 }),
      velocity: Object.freeze({ x: 380, y: 120 }),
    };
    const line: Rope = {
      anchor: Object.freeze({ x: 10, y: -20 }),
      length: 260,
    };
    const input: SwingInput = { reel: -1, pump: 1 };
    const tuning: SwingTuning = { ...DEFAULT_SWING_TUNING };

    const next = stepSwing(
      Object.freeze(body),
      Object.freeze(line),
      Object.freeze(input),
      Object.freeze(tuning),
      1 / 30,
    );

    expect(body).toEqual({
      position: { x: 220, y: -40 },
      velocity: { x: 380, y: 120 },
    });
    expect(line).toEqual({ anchor: { x: 10, y: -20 }, length: 260 });
    expect(input).toEqual({ reel: -1, pump: 1 });
    expect(next.body.position).not.toBe(body.position);
    expect(next.rope.anchor).not.toBe(line.anchor);
  });
});
