import { describe, expect, test } from "bun:test";
import type { Rect } from "../physics/vector";
import { hasLineOfSight, segmentHitsRect, withinCone } from "./vision";

/** A block whose roof line sits at y=1000 and which meets the street at 1450. */
const building: Rect = { x: 800, y: 1000, width: 520, height: 450 };

describe("segmentHitsRect", () => {
  test("reports a crossing segment", () => {
    expect(
      segmentHitsRect({ x: 700, y: 1200 }, { x: 1400, y: 1200 }, building),
    ).toBe(true);
  });

  test("ignores a segment that passes above the box", () => {
    expect(
      segmentHitsRect({ x: 700, y: 900 }, { x: 1400, y: 900 }, building),
    ).toBe(false);
  });

  test("ignores a segment that stops short of the box", () => {
    expect(
      segmentHitsRect({ x: 400, y: 1200 }, { x: 700, y: 1200 }, building),
    ).toBe(false);
  });

  test("handles an axis-aligned segment inside the other slab", () => {
    expect(
      segmentHitsRect({ x: 900, y: 700 }, { x: 900, y: 1100 }, building),
    ).toBe(true);
  });

  test("handles an axis-aligned segment outside the other slab", () => {
    expect(
      segmentHitsRect({ x: 400, y: 700 }, { x: 400, y: 1400 }, building),
    ).toBe(false);
  });

  test("counts a degenerate segment inside the box", () => {
    expect(
      segmentHitsRect({ x: 900, y: 1100 }, { x: 900, y: 1100 }, building),
    ).toBe(true);
  });
});

describe("hasLineOfSight", () => {
  test("is clear with nothing in the way", () => {
    expect(hasLineOfSight({ x: 700, y: 1200 }, { x: 1400, y: 1200 }, [])).toBe(
      true,
    );
  });

  test("is broken by a building between the two points", () => {
    expect(
      hasLineOfSight({ x: 700, y: 1200 }, { x: 1400, y: 1200 }, [building]),
    ).toBe(false);
  });

  test("ignores a solid the viewer is standing inside", () => {
    // Street patrollers walk inside their own building volume.
    expect(
      hasLineOfSight({ x: 900, y: 1330 }, { x: 1400, y: 1330 }, [building]),
    ).toBe(true);
  });

  test("ignores a solid the target is standing inside", () => {
    expect(
      hasLineOfSight({ x: 400, y: 1330 }, { x: 900, y: 1330 }, [building]),
    ).toBe(true);
  });

  test("still sees over the roof line", () => {
    expect(
      hasLineOfSight({ x: 700, y: 900 }, { x: 1400, y: 940 }, [building]),
    ).toBe(true);
  });
});

describe("withinCone", () => {
  const eye = { x: 1000, y: 900 };
  const halfAngle = Math.PI / 3;

  test("sees straight ahead", () => {
    expect(withinCone(eye, 1, { x: 1400, y: 900 }, halfAngle)).toBe(true);
  });

  test("does not see straight behind", () => {
    expect(withinCone(eye, 1, { x: 600, y: 900 }, halfAngle)).toBe(false);
  });

  test("mirrors when facing left", () => {
    expect(withinCone(eye, -1, { x: 600, y: 900 }, halfAngle)).toBe(true);
  });

  test("rejects a target just outside the cone edge", () => {
    // 70 degrees off the facing axis, cone half-angle is 60.
    const offset = (70 * Math.PI) / 180;
    const target = {
      x: eye.x + Math.cos(offset) * 400,
      y: eye.y + Math.sin(offset) * 400,
    };
    expect(withinCone(eye, 1, target, halfAngle)).toBe(false);
  });

  test("accepts a target just inside the cone edge", () => {
    const offset = (50 * Math.PI) / 180;
    const target = {
      x: eye.x + Math.cos(offset) * 400,
      y: eye.y + Math.sin(offset) * 400,
    };
    expect(withinCone(eye, 1, target, halfAngle)).toBe(true);
  });

  test("treats a target on top of the viewer as visible", () => {
    expect(withinCone(eye, 1, eye, halfAngle)).toBe(true);
  });
});
