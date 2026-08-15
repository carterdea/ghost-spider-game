import { describe, expect, test } from "bun:test";
import {
  asScene,
  type FakeTileSprite,
  SceneDouble,
} from "../testing/sceneDouble";
import { RainCurtain, type RainSurface } from "./RainCurtain";
import { MAX_SPLASHES, RAIN_LAYERS, weatherFor } from "./weather";

const WEATHER = weatherFor({
  id: "harbor-crane-run",
  backdropKey: "environment-waterfront",
});

const ROOFS: readonly RainSurface[] = [
  { left: 0, right: 900, y: 420 },
  { left: 1100, right: 1800, y: 300 },
];

/**
 * A curtain hung over a view the camera has already drawn once, which is every
 * frame after the one the district was built on.
 */
const curtainOn = (scene: SceneDouble, surfaces = ROOFS): RainCurtain => {
  const curtain = new RainCurtain(asScene(scene), WEATHER, surfaces);
  scene.events.emit("render");
  return curtain;
};

const sheetsOf = (scene: SceneDouble): FakeTileSprite[] =>
  scene.objects.filter(
    (object): object is FakeTileSprite => object.kind === "tileSprite",
  );

/** Runs `ms` of weather in even steps, the way a fixed frame rate would. */
const run = (curtain: RainCurtain, ms: number, step: number): void => {
  const frames = Math.round(ms / step);
  for (let frame = 0; frame < frames; frame += 1) {
    curtain.update(step);
  }
};

/** Pins randomness so splash lifetimes stop being noise in a comparison. */
const withFixedRandom = (value: number, body: () => void): void => {
  const real = Math.random;
  Math.random = () => value;
  try {
    body();
  } finally {
    Math.random = real;
  }
};

describe("the curtain", () => {
  test("draws one sheet per layer plus a single sheet of splashes", () => {
    const scene = new SceneDouble();
    curtainOn(scene);

    expect(sheetsOf(scene)).toHaveLength(RAIN_LAYERS.length);
    expect(
      scene.objects.filter((object) => object.kind === "graphics"),
    ).toHaveLength(1);
  });

  test("every sheet sits behind the hero, the telegraphs and the webbing", () => {
    const scene = new SceneDouble();
    curtainOn(scene);

    // The hero is at 8, an enemy wind-up at 7, the web line at 20. Nothing the
    // weather draws may cover any of them.
    for (const object of scene.objects) {
      expect(object.depth).toBeLessThan(7);
    }
  });

  test("the rain is drawn faint, and fainter still in a drier district", () => {
    const wet = new SceneDouble();
    const dry = new SceneDouble();
    curtainOn(wet);
    new RainCurtain(
      asScene(dry),
      weatherFor({ id: "park-side-pursuit", backdropKey: "environment-park" }),
      ROOFS,
    );

    for (const [index, sheet] of sheetsOf(wet).entries()) {
      expect(sheet.alpha).toBeLessThan(0.55);
      expect(sheet.alpha).toBeGreaterThan(sheetsOf(dry)[index].alpha);
    }
  });

  test("sheets cover the view even when the wind has turned them", () => {
    const scene = new SceneDouble();
    const curtain = curtainOn(scene);
    curtain.update(16);

    const diagonal = Math.hypot(
      scene.cameras.main.worldView.width,
      scene.cameras.main.worldView.height,
    );
    for (const sheet of sheetsOf(scene)) {
      expect(sheet.width).toBeGreaterThanOrEqual(diagonal);
      expect(sheet.height).toBeGreaterThanOrEqual(diagonal);
      expect(sheet.x).toBe(scene.cameras.main.worldView.centerX);
    }
  });
});

describe("raising the curtain", () => {
  test("the sheets stay off the world until the camera has framed the district", () => {
    const scene = new SceneDouble();
    const curtain = new RainCurtain(asScene(scene), WEATHER, ROOFS);

    // A curtain is raised while the level is being built, and a camera only
    // refreshes its view when it renders: until then the view on offer is the
    // one the last district was framed through.
    expect(sheetsOf(scene).every((sheet) => sheet.visible)).toBe(false);
    curtain.update(16);
    expect(sheetsOf(scene).every((sheet) => sheet.tilePositionY === 0)).toBe(
      true,
    );

    scene.events.emit("render");

    for (const sheet of sheetsOf(scene)) {
      expect(sheet.visible).toBe(true);
      expect(sheet.x).toBe(scene.cameras.main.worldView.centerX);
      expect(sheet.y).toBe(scene.cameras.main.worldView.centerY);
    }
  });

  test("the district it was built on is never read as a frame of camera travel", () => {
    const moved = new SceneDouble();
    const still = new SceneDouble();

    // Built against the district being left, then framed on the new one.
    const carried = new RainCurtain(asScene(moved), WEATHER, ROOFS);
    moved.cameras.main.centerOn(9000, 4000);
    moved.events.emit("render");
    const settled = curtainOn(still);

    withFixedRandom(0.5, () => {
      run(carried, 200, 1000 / 60);
      run(settled, 200, 1000 / 60);
    });

    for (const [index, sheet] of sheetsOf(moved).entries()) {
      expect(sheet.x).toBe(moved.cameras.main.worldView.centerX);
      // Nothing moved in either scene, so the sheets have to agree: a curtain
      // that took the distance between the districts as travel would have been
      // scrolled and turned by a gale.
      expect(sheet.tilePositionX).toBeCloseTo(
        sheetsOf(still)[index].tilePositionX,
        4,
      );
      expect(sheet.rotation).toBeCloseTo(sheetsOf(still)[index].rotation, 4);
    }
  });
});

describe("frame-rate independence", () => {
  test("half the frames at twice the delta lands in the same place", () => {
    const fast = new SceneDouble();
    const slow = new SceneDouble();
    const camera = { fast: curtainOn(fast), slow: curtainOn(slow) };

    withFixedRandom(0.5, () => {
      run(camera.fast, 1000, 1000 / 60);
      run(camera.slow, 1000, 1000 / 30);
    });

    for (const [index, sheet] of sheetsOf(fast).entries()) {
      expect(sheet.tilePositionY).toBeCloseTo(
        sheetsOf(slow)[index].tilePositionY,
        4,
      );
    }
  });

  test("the same second of rain strikes the same number of splashes", () => {
    const fast = new SceneDouble();
    const slow = new SceneDouble();
    const fastCurtain = curtainOn(fast);
    const slowCurtain = curtainOn(slow);

    withFixedRandom(0.5, () => {
      run(fastCurtain, 600, 1000 / 60);
      run(slowCurtain, 600, 1000 / 30);
    });

    expect(fastCurtain.liveSplashes).toBeGreaterThan(0);
    expect(
      Math.abs(fastCurtain.liveSplashes - slowCurtain.liveSplashes),
    ).toBeLessThanOrEqual(2);
  });

  test("the rain holds still while the simulation is held", () => {
    const scene = new SceneDouble();
    const curtain = curtainOn(scene);
    run(curtain, 200, 1000 / 60);
    const before = sheetsOf(scene).map((sheet) => sheet.tilePositionY);

    scene.physics.world.isPaused = true;
    run(curtain, 500, 1000 / 60);

    expect(sheetsOf(scene).map((sheet) => sheet.tilePositionY)).toEqual(before);

    scene.physics.world.isPaused = false;
    run(curtain, 100, 1000 / 60);

    expect(sheetsOf(scene)[0].tilePositionY).toBeLessThan(before[0]);
  });

  test("a stalled frame costs splashes, never the pool", () => {
    const scene = new SceneDouble();
    const curtain = curtainOn(scene);

    curtain.update(4000);
    run(curtain, 2000, 1000 / 60);

    expect(curtain.liveSplashes).toBeLessThanOrEqual(MAX_SPLASHES);
  });
});

describe("splashes", () => {
  test("only roof lines the camera can see are struck", () => {
    const scene = new SceneDouble();
    const curtain = curtainOn(scene, [{ left: 0, right: 400, y: 9000 }]);

    run(curtain, 500, 1000 / 60);
    expect(curtain.liveSplashes).toBe(0);

    scene.cameras.main.centerOn(200, 9000);
    run(curtain, 500, 1000 / 60);
    expect(curtain.liveSplashes).toBeGreaterThan(0);
  });

  test("a district left behind takes its splashes with it", () => {
    const scene = new SceneDouble();
    const curtain = curtainOn(scene);
    run(curtain, 500, 1000 / 60);
    expect(curtain.liveSplashes).toBeGreaterThan(0);

    curtain.reset();

    expect(curtain.liveSplashes).toBe(0);
  });
});

describe("teardown", () => {
  test("the curtain gives back its listener and its objects", () => {
    const scene = new SceneDouble();
    const curtain = curtainOn(scene);
    expect(scene.events.count("update")).toBe(1);

    curtain.destroy();

    expect(scene.events.count("update")).toBe(0);
    expect(scene.events.count("shutdown")).toBe(0);
    expect(scene.liveObjects()).toHaveLength(0);
  });

  test("a curtain torn down before its first frame stays torn down", () => {
    const scene = new SceneDouble();
    const curtain = new RainCurtain(asScene(scene), WEATHER, ROOFS);

    curtain.destroy();
    scene.events.emit("render");

    expect(scene.events.count("render")).toBe(0);
    expect(scene.liveObjects()).toHaveLength(0);
    expect(scene.objects.every((object) => object.destroyCount === 1)).toBe(
      true,
    );
  });

  test("tearing down twice destroys each object exactly once", () => {
    const scene = new SceneDouble();
    const curtain = curtainOn(scene);

    curtain.destroy();
    curtain.destroy();

    expect(scene.objects.every((object) => object.destroyCount === 1)).toBe(
      true,
    );
  });

  test("a destroyed curtain never draws into the next district", () => {
    const scene = new SceneDouble();
    const curtain = curtainOn(scene);
    run(curtain, 200, 1000 / 60);
    const before = sheetsOf(scene).map((sheet) => sheet.tilePositionY);

    curtain.destroy();
    scene.events.emit("update", ...([0, 16] as never[]));
    curtain.update(16);

    expect(sheetsOf(scene).map((sheet) => sheet.tilePositionY)).toEqual(before);
    expect(curtain.liveSplashes).toBe(0);
  });

  test("the scene shutting down takes the weather with it", () => {
    const scene = new SceneDouble();
    curtainOn(scene);

    scene.events.emit("shutdown");

    expect(scene.events.count("update")).toBe(0);
    expect(scene.liveObjects()).toHaveLength(0);
  });

  test("the scene's own update drives the rain", () => {
    const scene = new SceneDouble();
    const curtain = curtainOn(scene);

    scene.events.emit("update", ...([0, 32] as never[]));

    expect(sheetsOf(scene)[0].tilePositionY).not.toBe(0);
    expect(curtain.liveSplashes).toBeGreaterThan(0);
  });
});
