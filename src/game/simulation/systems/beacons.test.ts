import { describe, expect, test } from "bun:test";
import {
  type BeaconBlink,
  beaconStateAt,
  blinkPeriod,
  isBeaconCatchable,
} from "./beacons";

const BLINK: BeaconBlink = {
  litMs: 2000,
  flickerMs: 600,
  darkMs: 1400,
  offsetMs: 0,
};

describe("beaconStateAt", () => {
  test("runs lit, then flicker, then dark", () => {
    expect(beaconStateAt(BLINK, 0)).toBe("lit");
    expect(beaconStateAt(BLINK, 1999)).toBe("lit");
    expect(beaconStateAt(BLINK, 2000)).toBe("flicker");
    expect(beaconStateAt(BLINK, 2599)).toBe("flicker");
    expect(beaconStateAt(BLINK, 2600)).toBe("dark");
    expect(beaconStateAt(BLINK, 3999)).toBe("dark");
  });

  test("comes back lit every period", () => {
    const period = blinkPeriod(BLINK);
    expect(beaconStateAt(BLINK, period)).toBe("lit");
    expect(beaconStateAt(BLINK, period * 7 + 2100)).toBe("flicker");
  });

  test("an offset shifts where a mast starts in its cycle", () => {
    const late = { ...BLINK, offsetMs: 2600 };
    expect(beaconStateAt(late, 0)).toBe("dark");
    expect(beaconStateAt(late, 1400)).toBe("lit");
  });

  test("negative time still lands inside the cycle", () => {
    expect(beaconStateAt(BLINK, -100)).toBe("dark");
  });
});

describe("isBeaconCatchable", () => {
  test("a flickering lamp still holds a web; only dark refuses it", () => {
    expect(isBeaconCatchable("lit")).toBe(true);
    expect(isBeaconCatchable("flicker")).toBe(true);
    expect(isBeaconCatchable("dark")).toBe(false);
  });
});
