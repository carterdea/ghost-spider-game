import { describe, expect, test } from "bun:test";
import {
  type AttachmentTuning,
  chooseAttachment,
  DEFAULT_ATTACHMENT_TUNING,
} from "./attachment";
import type { Vec2 } from "./vector";

const TUNING: AttachmentTuning = DEFAULT_ATTACHMENT_TUNING;
const GROUND_Y = 1450;

/** Hero cruising rightwards at street level, the case both bugs showed up in. */
const onStreet: Vec2 = { x: 1050, y: 1354 };

describe("chooseAttachment", () => {
  test("returns nothing when no anchor is in reach", () => {
    expect(
      chooseAttachment([{ x: 4000, y: 200 }], onStreet, 1, GROUND_Y),
    ).toBeUndefined();
  });

  test("returns nothing when every anchor is below the hero", () => {
    expect(
      chooseAttachment([{ x: 1200, y: 1400 }], onStreet, 1, GROUND_Y),
    ).toBeUndefined();
  });

  test("ignores anchors that are overhead but not clear enough", () => {
    const barelyAbove = { x: 1060, y: onStreet.y - TUNING.minClearance + 1 };
    expect(
      chooseAttachment([barelyAbove], onStreet, 1, GROUND_Y),
    ).toBeUndefined();
  });

  test("prefers a forward diagonal anchor over one almost straight overhead", () => {
    const overhead = { x: 1118, y: 828 };
    const diagonal = { x: 1320, y: 1100 };

    const chosen = chooseAttachment(
      [overhead, diagonal],
      onStreet,
      1,
      GROUND_Y,
    );

    expect(chosen?.anchor).toEqual(diagonal);
  });

  test("mirrors that preference when the hero travels left", () => {
    const overhead = { x: 982, y: 828 };
    const diagonal = { x: 780, y: 1100 };

    const chosen = chooseAttachment(
      [overhead, diagonal],
      onStreet,
      -1,
      GROUND_Y,
    );

    expect(chosen?.anchor).toEqual(diagonal);
  });

  test("skips anchors behind the hero when a forward one exists", () => {
    const behind = { x: 700, y: 1000 };
    const ahead = { x: 1400, y: 1050 };

    const chosen = chooseAttachment([behind, ahead], onStreet, 1, GROUND_Y);

    expect(chosen?.anchor).toEqual(ahead);
  });

  test("falls back to a rearward anchor when nothing lies ahead", () => {
    const behind = { x: 700, y: 1000 };

    const chosen = chooseAttachment([behind], onStreet, 1, GROUND_Y);

    expect(chosen?.anchor).toEqual(behind);
  });

  test("catches at the current distance so the rope never jolts", () => {
    const anchor = { x: 1320, y: 1100 };

    const chosen = chooseAttachment([anchor], onStreet, 1, GROUND_Y);
    const actual = Math.hypot(anchor.x - onStreet.x, anchor.y - onStreet.y);

    expect(chosen?.length).toBeCloseTo(actual, 6);
  });

  test("targets a length whose arc bottom clears the ground", () => {
    const anchors = [
      { x: 1320, y: 1100 },
      { x: 1200, y: 900 },
      { x: 1450, y: 1150 },
    ];

    for (const anchor of anchors) {
      const chosen = chooseAttachment([anchor], onStreet, 1, GROUND_Y);
      if (!chosen) {
        continue;
      }
      const arcBottom = chosen.anchor.y + chosen.targetLength;
      expect(arcBottom).toBeLessThanOrEqual(GROUND_Y - TUNING.groundClearance);
    }
  });

  test("never targets a length below the rope minimum", () => {
    // An anchor barely above the pavement: clearance maths would go negative.
    const lowAnchor = { x: 1300, y: GROUND_Y - 130 };
    const nearGround: Vec2 = { x: 1200, y: GROUND_Y - 10 };

    const chosen = chooseAttachment([lowAnchor], nearGround, 1, GROUND_Y);

    expect(chosen?.targetLength).toBe(TUNING.minRopeLength);
  });

  test("target length never exceeds the catch length", () => {
    const highAnchor = { x: 1200, y: 300 };
    const fromRoof: Vec2 = { x: 1100, y: 700 };

    const chosen = chooseAttachment([highAnchor], fromRoof, 1, GROUND_Y);

    expect(chosen?.targetLength).toBeLessThanOrEqual(chosen?.length ?? 0);
  });

  test("clamps the rope to the configured maximum", () => {
    // Within catching reach, but a longer line than the rope may hold.
    const far = { x: onStreet.x + 283, y: onStreet.y - 283 };

    const chosen = chooseAttachment([far], onStreet, 1, GROUND_Y, {
      ...TUNING,
      maxRopeLength: 300,
    });

    expect(chosen?.length).toBe(300);
  });

  test("handles an anchor exactly overhead without producing NaN", () => {
    const exactlyAbove = { x: onStreet.x, y: onStreet.y - 400 };

    const chosen = chooseAttachment([exactlyAbove], onStreet, 1, GROUND_Y);

    expect(chosen).toBeDefined();
    expect(Number.isFinite(chosen?.length ?? Number.NaN)).toBe(true);
    expect(Number.isFinite(chosen?.targetLength ?? Number.NaN)).toBe(true);
  });

  test("does not mutate the anchors it is given", () => {
    const anchors = [Object.freeze({ x: 1320, y: 1100 })];

    const chosen = chooseAttachment(anchors, onStreet, 1, GROUND_Y);

    expect(chosen?.anchor).not.toBe(anchors[0]);
    expect(anchors[0]).toEqual({ x: 1320, y: 1100 });
  });

  test("picks a real anchor out of a dense generated set", () => {
    // Roughly the anchor density a compiled level produces.
    const anchors: Vec2[] = [];
    for (let x = 800; x <= 1320; x += 180) {
      anchors.push({ x, y: 828 });
      anchors.push({ x, y: 1100 });
    }

    const chosen = chooseAttachment(anchors, onStreet, 1, GROUND_Y);

    if (!chosen) {
      throw new Error("expected an attachment from a dense anchor set");
    }
    expect(anchors).toContainEqual(chosen.anchor);
    expect(chosen.anchor.x).toBeGreaterThan(onStreet.x);
  });
});
