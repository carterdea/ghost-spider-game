import { describe, expect, test } from "bun:test";
import { predictPosition, velocityToward } from "./aim";

const origin = { x: 0, y: 0 };

describe("predictPosition", () => {
  test("returns the target when it is not moving", () => {
    expect(
      predictPosition(origin, { x: 380, y: 0 }, { x: 0, y: 0 }, 380, 1, 2),
    ).toEqual({ x: 380, y: 0 });
  });

  test("leads a mover by the projectile's flight time", () => {
    // 380px away at 380px/s is a one second flight.
    expect(
      predictPosition(origin, { x: 380, y: 0 }, { x: 200, y: 0 }, 380, 1, 2),
    ).toEqual({ x: 580, y: 0 });
  });

  test("under-leads by the fairness factor", () => {
    expect(
      predictPosition(origin, { x: 380, y: 0 }, { x: 200, y: 0 }, 380, 0.5, 2),
    ).toEqual({ x: 480, y: 0 });
  });

  test("clamps the prediction horizon", () => {
    expect(
      predictPosition(origin, { x: 3800, y: 0 }, { x: 100, y: 0 }, 380, 1, 0.5),
    ).toEqual({ x: 3850, y: 0 });
  });

  test("aims at the current position when the lead factor is zero", () => {
    expect(
      predictPosition(origin, { x: 380, y: 0 }, { x: 900, y: 900 }, 380, 0, 2),
    ).toEqual({ x: 380, y: 0 });
  });

  test("falls back to the horizon when nothing travels", () => {
    expect(
      predictPosition(origin, { x: 100, y: 0 }, { x: 10, y: 0 }, 0, 1, 0.5),
    ).toEqual({ x: 105, y: 0 });
  });
});

describe("velocityToward", () => {
  test("has the requested magnitude", () => {
    const velocity = velocityToward(origin, { x: 300, y: 400 }, 200);
    expect(Math.hypot(velocity.x, velocity.y)).toBeCloseTo(200, 6);
  });

  test("points at the target", () => {
    expect(velocityToward(origin, { x: 0, y: 500 }, 120)).toEqual({
      x: 0,
      y: 120,
    });
  });

  test("produces no motion when the target is the origin", () => {
    expect(velocityToward(origin, origin, 300)).toEqual({ x: 0, y: 0 });
  });
});
