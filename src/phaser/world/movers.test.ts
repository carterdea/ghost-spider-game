import { describe, expect, test } from "bun:test";
import type { PlatformCycle, PlatformMotion } from "../../game/content/levels";
import type { Vec2 } from "../../game/simulation/physics/vector";
import {
  carryRiders,
  cyclePeriod,
  type DeckSpan,
  isLedgeSolid,
  isRiding,
  ledgeAlphaAt,
  ledgePhaseAt,
  motionPeriod,
  motionProgressAt,
  platformOffsetAt,
  RIDER_GRIP,
  type Rider,
} from "./movers";

const MOTION: PlatformMotion = {
  dx: 400,
  dy: -200,
  travelMs: 2000,
  holdMs: 800,
};

const CYCLE: PlatformCycle = {
  solidMs: 2000,
  warnMs: 800,
  goneMs: 1200,
  offsetMs: 0,
};

const DECK: DeckSpan = { left: 100, right: 300, top: 500 };

/** The Drydock hoist, exactly as the district authors it. */
const HOIST: PlatformMotion = {
  dx: 0,
  dy: -330,
  travelMs: 2200,
  holdMs: 900,
};

/** Arcade steps at a fixed 60Hz, so this is one collision check's worth of run. */
const STEP_MS = 1000 / 60;

/** A rider that actually moves, so a carry can be simulated across frames. */
const riderAt = (left: number, bottom: number): Rider & { moved: Vec2[] } => {
  const moved: Vec2[] = [];
  const bounds = { left, right: left + 50, bottom };
  return {
    moved,
    bounds,
    moveBy: (delta) => {
      moved.push(delta);
      bounds.left += delta.x;
      bounds.right += delta.x;
      bounds.bottom += delta.y;
    },
  };
};

describe("platform motion", () => {
  test("one period is a rest, a run, a rest, and the run back", () => {
    expect(motionPeriod(MOTION)).toBe(5600);
  });

  test("rests at both ends of the run", () => {
    // The whole outbound hold, and the whole return hold.
    for (const elapsed of [0, 400, 799]) {
      expect(motionProgressAt(MOTION, elapsed)).toBe(0);
    }
    for (const elapsed of [2800, 3200, 3599]) {
      expect(motionProgressAt(MOTION, elapsed)).toBe(1);
    }
  });

  test("reaches each end exactly and comes back to the start", () => {
    expect(motionProgressAt(MOTION, 800)).toBe(0);
    expect(motionProgressAt(MOTION, 2800)).toBe(1);
    expect(motionProgressAt(MOTION, 5600)).toBe(0);
  });

  /**
   * The hero has no way to grab a ledge, so a deck that snapped to full speed
   * the instant it left a rest would shrug them off. The ease has to start and
   * finish slow.
   */
  test("eases in and out rather than jumping to speed", () => {
    const speedAt = (elapsed: number): number =>
      Math.abs(
        motionProgressAt(MOTION, elapsed + 8) -
          motionProgressAt(MOTION, elapsed),
      );

    const leaving = speedAt(810);
    const midRun = speedAt(1800);
    const arriving = speedAt(2780);

    expect(leaving).toBeLessThan(midRun / 4);
    expect(arriving).toBeLessThan(midRun / 4);
  });

  test("never leaves the authored run, in either direction", () => {
    for (let elapsed = 0; elapsed <= motionPeriod(MOTION) * 2; elapsed += 37) {
      const offset = platformOffsetAt(MOTION, elapsed);
      expect(offset.x).toBeGreaterThanOrEqual(0);
      expect(offset.x).toBeLessThanOrEqual(MOTION.dx);
      expect(offset.y).toBeLessThanOrEqual(0);
      expect(offset.y).toBeGreaterThanOrEqual(MOTION.dy);
    }
  });

  test("a negative elapsed time reads the same cycle, not a broken one", () => {
    expect(motionProgressAt(MOTION, -5600)).toBe(motionProgressAt(MOTION, 0));
    expect(motionProgressAt(MOTION, -2800)).toBe(
      motionProgressAt(MOTION, 2800),
    );
  });
});

describe("phasing ledges", () => {
  test("runs solid, then warns, then goes, then repeats", () => {
    expect(cyclePeriod(CYCLE)).toBe(4000);
    expect(ledgePhaseAt(CYCLE, 0).state).toBe("solid");
    expect(ledgePhaseAt(CYCLE, 1999).state).toBe("solid");
    expect(ledgePhaseAt(CYCLE, 2000).state).toBe("warn");
    expect(ledgePhaseAt(CYCLE, 2799).state).toBe("warn");
    expect(ledgePhaseAt(CYCLE, 2800).state).toBe("gone");
    expect(ledgePhaseAt(CYCLE, 3999).state).toBe("gone");
    expect(ledgePhaseAt(CYCLE, 4000).state).toBe("solid");
  });

  /**
   * The whole fairness claim: the panel is still a floor for the entire time it
   * is flashing, so the warning is a window to react in rather than a report of
   * something that already happened.
   */
  test("stays solid for every millisecond of its own warning", () => {
    for (let elapsed = 2000; elapsed < 2800; elapsed += 10) {
      expect(isLedgeSolid(ledgePhaseAt(CYCLE, elapsed).state)).toBe(true);
    }
    expect(isLedgeSolid(ledgePhaseAt(CYCLE, 2800).state)).toBe(false);
  });

  test("an offset shifts the cycle without changing its shape", () => {
    const offset: PlatformCycle = { ...CYCLE, offsetMs: 2000 };
    expect(ledgePhaseAt(offset, 0).state).toBe("warn");
    expect(ledgePhaseAt(offset, 800).state).toBe("gone");
    expect(ledgePhaseAt(offset, 2000).state).toBe("solid");
  });

  test("a gone panel stays visible as a ghost, and a solid one is opaque", () => {
    expect(ledgeAlphaAt(ledgePhaseAt(CYCLE, 500))).toBe(1);

    const gone = ledgeAlphaAt(ledgePhaseAt(CYCLE, 3000));
    expect(gone).toBeGreaterThan(0);
    expect(gone).toBeLessThan(0.3);
  });

  test("the warning is visibly not the solid state at any point in it", () => {
    for (let elapsed = 2000; elapsed < 2800; elapsed += 10) {
      expect(ledgeAlphaAt(ledgePhaseAt(CYCLE, elapsed))).toBeLessThanOrEqual(1);
    }
    // It actually strobes rather than sitting at one dimmer value.
    const samples = [2050, 2200, 2400, 2600, 2750].map((elapsed) =>
      ledgeAlphaAt(ledgePhaseAt(CYCLE, elapsed)),
    );
    expect(new Set(samples).size).toBeGreaterThan(3);
    expect(Math.min(...samples)).toBeLessThan(0.8);
  });
});

describe("riding a deck", () => {
  test("feet on the deck within the grip band count as riding", () => {
    expect(isRiding({ left: 150, right: 200, bottom: 500 }, DECK)).toBe(true);
    expect(
      isRiding({ left: 150, right: 200, bottom: 500 + RIDER_GRIP }, DECK),
    ).toBe(true);
    expect(
      isRiding({ left: 150, right: 200, bottom: 500 - RIDER_GRIP }, DECK),
    ).toBe(true);
  });

  test("a body in the air above, or fallen past, is not riding", () => {
    expect(isRiding({ left: 150, right: 200, bottom: 300 }, DECK)).toBe(false);
    expect(isRiding({ left: 150, right: 200, bottom: 700 }, DECK)).toBe(false);
  });

  test("a body beside the deck is not riding it", () => {
    expect(isRiding({ left: 20, right: 100, bottom: 500 }, DECK)).toBe(false);
    expect(isRiding({ left: 300, right: 380, bottom: 500 }, DECK)).toBe(false);
    // Overlapping by a sliver still counts: half a foot on is on.
    expect(isRiding({ left: 60, right: 110, bottom: 500 }, DECK)).toBe(true);
  });

  test("carries only what stands on it, by exactly the deck's travel", () => {
    const standing = riderAt(150, 500);
    const flying = riderAt(150, 200);
    const beside = riderAt(400, 500);

    const carried = carryRiders([standing, flying, beside], DECK, {
      x: 12,
      y: 0,
    });

    expect(carried).toBe(1);
    expect(standing.moved).toEqual([{ x: 12, y: 0 }]);
    expect(flying.moved).toEqual([]);
    expect(beside.moved).toEqual([]);
  });

  test("a stationary deck carries nobody", () => {
    const standing = riderAt(150, 500);
    expect(carryRiders([standing], DECK, { x: 0, y: 0 })).toBe(0);
    expect(standing.moved).toEqual([]);
  });

  test("carries backwards on the return leg", () => {
    const standing = riderAt(150, 500);
    carryRiders([standing], DECK, { x: -9.5, y: 0 });
    expect(standing.moved).toEqual([{ x: -9.5, y: 0 }]);
  });

  /**
   * A hoist travels straight up. Nothing else moves a rider vertically —
   * Arcade separation only unpicks an overlap it believes in, and a deck faster
   * than the hero's own weight builds one bigger than that in a single step.
   */
  test("hands over vertical travel as well as horizontal", () => {
    const standing = riderAt(150, 500);

    expect(carryRiders([standing], DECK, { x: 0, y: -3.9 })).toBe(1);
    expect(standing.moved).toEqual([{ x: 0, y: -3.9 }]);
    expect(standing.bounds.bottom).toBe(496.1);
  });

  test("a descending deck takes its rider down with it", () => {
    const standing = riderAt(150, 500);

    carryRiders([standing], DECK, { x: 0, y: 3.9 });

    expect(standing.bounds.bottom).toBe(503.9);
  });

  /**
   * The whole of the hoist bug, at the scale it happened: the deck climbs 330px
   * in 2.2 seconds and the hero has to still be standing on it at the top.
   * Before the vertical carry the deck simply left them behind — within a
   * couple of frames of leaving its rest the feet were outside the grip band,
   * contact was gone, and the hero fell to the street.
   */
  test("a rising hoist cannot outrun the rider standing on it", () => {
    const home = 980;
    const rider = riderAt(600, home);
    let deckTop = home;
    let drift = 0;

    for (let elapsed = 0; elapsed <= motionPeriod(HOIST); elapsed += STEP_MS) {
      const top = home + platformOffsetAt(HOIST, elapsed).y;
      carryRiders(
        [rider],
        { left: 560, right: 760, top },
        { x: 0, y: top - deckTop },
      );
      deckTop = top;
      drift = Math.max(drift, Math.abs(rider.bounds.bottom - deckTop));
    }

    // Never so much as a pixel adrift, at any point of the run or the way back.
    expect(drift).toBeLessThan(1);
    // And the deck really did make its climb, so this cannot pass on a mover
    // that never moved.
    expect(rider.moved.length).toBeGreaterThan(100);
    expect(Math.min(...rider.moved.map((step) => step.y))).toBeLessThan(-3.5);
  });
});
