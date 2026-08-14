import { describe, expect, test } from "bun:test";
import { STRAND_SAMPLES, sagFor, strand, traceStrand } from "./webStrand";

const LAST = STRAND_SAMPLES - 1;

/** Distance of every sample from the straight anchor-to-hand line. */
const maxDeviation = (
  anchorX: number,
  anchorY: number,
  handX: number,
  handY: number,
): number => {
  const dx = handX - anchorX;
  const dy = handY - anchorY;
  const span = Math.hypot(dx, dy);
  let worst = 0;
  for (let index = 0; index < STRAND_SAMPLES; index += 1) {
    const offsetX = strand.x[index] - anchorX;
    const offsetY = strand.y[index] - anchorY;
    worst = Math.max(worst, Math.abs((offsetX * dy - offsetY * dx) / span));
  }
  return worst;
};

describe("strand geometry", () => {
  test("a taut line is straight", () => {
    traceStrand(100, 100, 400, 340, 0, 0, 0);

    expect(maxDeviation(100, 100, 400, 340)).toBeCloseTo(0, 9);
  });

  test("both ends stay pinned however the strand is shaped", () => {
    traceStrand(100, 100, 400, 340, 90, 6, 2.5);

    expect(strand.x[0]).toBeCloseTo(100, 9);
    expect(strand.y[0]).toBeCloseTo(100, 9);
    expect(strand.x[LAST]).toBeCloseTo(400, 9);
    expect(strand.y[LAST]).toBeCloseTo(340, 9);
  });

  test("slack bows a horizontal strand downward, deepest at mid-span", () => {
    traceStrand(0, 200, 300, 200, 60, 0, 0);

    const middle = strand.y[LAST / 2];
    expect(middle).toBeGreaterThan(200);
    for (let index = 0; index < STRAND_SAMPLES; index += 1) {
      expect(strand.y[index]).toBeLessThanOrEqual(middle + 1e-9);
    }
  });

  test("a deeper sag bows further", () => {
    traceStrand(0, 200, 300, 200, 20, 0, 0);
    const shallow = strand.y[LAST / 2];
    traceStrand(0, 200, 300, 200, 80, 0, 0);

    expect(strand.y[LAST / 2]).toBeGreaterThan(shallow);
  });

  test("a strand hanging straight down still buckles sideways", () => {
    traceStrand(200, 100, 200, 400, 60, 0, 0);

    expect(maxDeviation(200, 100, 200, 400)).toBeGreaterThan(5);
  });

  test("the sample buffers are reused rather than reallocated", () => {
    traceStrand(0, 0, 100, 100, 0, 0, 0);
    const x = strand.x;
    const y = strand.y;
    traceStrand(50, 50, 300, 90, 40, 3, 1);

    expect(strand.x).toBe(x);
    expect(strand.y).toBe(y);
  });
});

describe("sag from the solver's own numbers", () => {
  test("a taut rope has no sag at all", () => {
    expect(sagFor(0, 400)).toBe(0);
  });

  test("a rope pulled past its length is still drawn straight", () => {
    expect(sagFor(-8, 400)).toBe(0);
  });

  test("sag grows with slack", () => {
    expect(sagFor(40, 400)).toBeGreaterThan(sagFor(10, 400));
  });

  test("sag deepens fast off zero, then flattens", () => {
    const early = sagFor(10, 400) - sagFor(0, 400);
    const late = sagFor(50, 400) - sagFor(40, 400);

    expect(early).toBeGreaterThan(late);
  });

  test("sag is capped so a slack line never reads as a dropped one", () => {
    expect(sagFor(10_000, 400)).toBeLessThanOrEqual(400 * 0.3);
  });
});
