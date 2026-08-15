import { describe, expect, test } from "bun:test";
import { LEVELS } from "../../game/content/levels";
import { leanAt, RAIN_LAYERS, rainScroll, weatherFor } from "./weather";

const midtown = {
  id: "midtown-after-dark",
  backdropKey: "environment-midtown",
};
const harbor = {
  id: "harbor-crane-run",
  backdropKey: "environment-waterfront",
};
const park = { id: "park-side-pursuit", backdropKey: "environment-park" };

describe("district weather", () => {
  test("open water is the wettest and the park the driest", () => {
    expect(weatherFor(harbor).intensity).toBeGreaterThan(
      weatherFor(midtown).intensity,
    );
    expect(weatherFor(midtown).intensity).toBeGreaterThan(
      weatherFor(park).intensity,
    );
  });

  test("every shipped district gets rain worth drawing", () => {
    for (const level of LEVELS) {
      const weather = weatherFor(level);
      expect(weather.intensity).toBeGreaterThan(0.4);
      expect(weather.intensity).toBeLessThanOrEqual(1);
      expect(Math.abs(weather.slant)).toBeLessThan(0.4);
    }
  });

  test("a district always blows the same way", () => {
    for (const level of LEVELS) {
      expect(weatherFor(level)).toEqual(weatherFor(level));
    }
    // And the wind is not the same everywhere: some district leans the far way.
    const slants = LEVELS.map((level) => Math.sign(weatherFor(level).slant));
    expect(new Set(slants).size).toBe(2);
  });

  test("an unknown backdrop still rains", () => {
    expect(
      weatherFor({ id: "elsewhere", backdropKey: "environment-nowhere" })
        .intensity,
    ).toBeGreaterThan(0);
  });
});

describe("wind", () => {
  const weather = weatherFor(midtown);

  test("gusts stay near the district's own lean while the camera is still", () => {
    for (let ms = 0; ms < 20000; ms += 137) {
      expect(Math.abs(leanAt(weather, ms, 0) - weather.slant)).toBeLessThan(
        0.1,
      );
    }
  });

  test("a camera chasing the hero leans the rain against its travel", () => {
    const still = leanAt(weather, 0, 0);
    expect(leanAt(weather, 0, 1200)).toBeGreaterThan(still);
    expect(leanAt(weather, 0, -1200)).toBeLessThan(still);
  });

  test("the lean the camera adds is capped, however fast the hero swings", () => {
    const far = leanAt(weather, 0, 40000) - leanAt(weather, 0, 0);
    expect(far).toBeCloseTo(0.26, 5);
  });
});

describe("sheet scroll", () => {
  const layer = RAIN_LAYERS[1];

  test("one frame and two half-frames land in the same place", () => {
    const whole = rainScroll(layer, 0.1, 40, 12, 0.2, 1);
    const first = rainScroll(layer, 0.05, 20, 6, 0.2, 1);
    const second = rainScroll(layer, 0.05, 20, 6, 0.2, 1);

    expect(first.x + second.x).toBeCloseTo(whole.x, 10);
    expect(first.y + second.y).toBeCloseTo(whole.y, 10);
  });

  test("rain falls even when nothing else moves", () => {
    const scroll = rainScroll(layer, 0.1, 0, 0, 0, 1);
    expect(scroll.x).toBe(0);
    expect(scroll.y).toBeLessThan(0);
  });

  test("a heavier district falls faster", () => {
    const heavy = rainScroll(layer, 0.1, 0, 0, 0, 1).y;
    const light = rainScroll(layer, 0.1, 0, 0, 0, 0.5).y;
    expect(heavy).toBeLessThan(light);
  });

  test("the sheets disagree about the camera, which is the depth cue", () => {
    const [far, mid, near] = RAIN_LAYERS.map(
      (candidate) =>
        rainScroll(candidate, 0, 100, 0, 0, 1).x * candidate.tileScale,
    );

    expect(far).toBeLessThan(mid);
    expect(mid).toBeLessThan(near);
    // The nearest sheet is pinned to the world: it takes the whole travel.
    expect(near).toBeCloseTo(100, 10);
  });

  test("a leaning sheet takes the camera's travel in its own frame", () => {
    const upright = rainScroll(layer, 0, 100, 0, 0, 1);
    const leaning = rainScroll(layer, 0, 100, 0, 0.3, 1);

    expect(leaning.x).toBeLessThan(upright.x);
    // Travel the sheet does not take sideways has to show up along its fall.
    expect(leaning.y).not.toBeCloseTo(upright.y, 6);
  });
});
