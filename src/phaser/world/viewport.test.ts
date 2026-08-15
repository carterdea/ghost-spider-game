import { describe, expect, test } from "bun:test";
import { LEVELS } from "../../game/content/levels";
import { frameZoom, MAX_VIEW, MIN_VIEW, type Size, viewSize } from "./viewport";

/** The speed pull-back `GameScene` applies, at both ends of its range. */
const EASES = [1, 0.82] as const;

/**
 * Window shapes the guarantee holds for: whatever the leftover axis is, the
 * frame still carries the whole authored view.
 */
const WINDOWS: ReadonlyArray<readonly [string, Size]> = [
  ["the reported wide-short window", { width: 1280, height: 577 }],
  ["a laptop", { width: 1440, height: 810 }],
  ["a desktop", { width: 1920, height: 1080 }],
  ["an ultrawide", { width: 3440, height: 1200 }],
  ["a near-square window", { width: 900, height: 860 }],
];

/**
 * Shapes so far from the authored frame that a cap has to bite: the level runs
 * out of height, or the frame would pull back past what the backdrop covers.
 * They are held to the bounds, not to the guarantee.
 */
const EXTREMES: ReadonlyArray<readonly [string, Size]> = [
  ["a tall narrow window", { width: 620, height: 1180 }],
  ["a letterbox slot", { width: 1600, height: 300 }],
  ["a phone", { width: 390, height: 844 }],
];

/** The level with the least room to spare is the one that bounds the camera. */
const tightestLevel: Size = LEVELS.reduce((tightest, level) =>
  level.width < tightest.width ? level : tightest,
);

describe("frameZoom", () => {
  for (const [name, window] of [...WINDOWS, ...EXTREMES]) {
    for (const ease of EASES) {
      test(`frames inside the level and the painted span on ${name} at ease ${ease}`, () => {
        const view = viewSize(window, frameZoom(window, tightestLevel, ease));

        // Past either and the player sees what nothing was drawn for: the void
        // beyond the level's edge, or the end of the parallax layers.
        expect(view.width).toBeLessThanOrEqual(tightestLevel.width);
        expect(view.height).toBeLessThanOrEqual(tightestLevel.height);
        expect(view.width).toBeLessThanOrEqual(MAX_VIEW.width);
        expect(view.height).toBeLessThanOrEqual(MAX_VIEW.height);
      });
    }
  }

  for (const [name, window] of WINDOWS) {
    test(`shows the whole authored frame on ${name}`, () => {
      const view = viewSize(window, frameZoom(window, tightestLevel));

      // One axis lands on the authored frame and the other overshoots it, which
      // is the point: the leftover is spent on world rather than on black bars.
      expect(view.width).toBeGreaterThanOrEqual(MIN_VIEW.width);
      expect(view.height).toBeGreaterThanOrEqual(MIN_VIEW.height);
    });
  }

  test("a short wide window spends its extra width on world, not on bars", () => {
    const window = { width: 1280, height: 577 };
    const view = viewSize(window, frameZoom(window, tightestLevel));

    // FIT drew this window as 1026x577 with 127px of black down either side.
    // The same window now paints all 720 of the authored height and buys three
    // hundred-odd pixels more of the block with what the bars were costing.
    expect(view.height).toBeCloseTo(MIN_VIEW.height, 3);
    expect(view.width).toBeGreaterThan(MIN_VIEW.width);
  });

  test("a taller window spends its extra height the same way", () => {
    const window = { width: 900, height: 1000 };
    const view = viewSize(window, frameZoom(window, tightestLevel));

    expect(view.width).toBeCloseTo(MIN_VIEW.width, 3);
    expect(view.height).toBeGreaterThan(MIN_VIEW.height);
  });

  test("the speed pull-back widens the frame it is given", () => {
    const window = { width: 1440, height: 810 };
    const resting = viewSize(window, frameZoom(window, tightestLevel, 1));
    const fast = viewSize(window, frameZoom(window, tightestLevel, 0.82));

    expect(fast.width).toBeGreaterThan(resting.width);
    expect(fast.height).toBeGreaterThan(resting.height);
  });

  test("a viewport with no area yet frames at 1 rather than at NaN", () => {
    expect(frameZoom({ width: 0, height: 0 }, tightestLevel)).toBe(1);
    expect(frameZoom(MIN_VIEW, { width: 0, height: 0 })).toBe(1);
  });
});
