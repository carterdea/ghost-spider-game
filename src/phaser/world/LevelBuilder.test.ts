import { describe, expect, test } from "bun:test";
import { LEVELS, type LevelDefinition } from "../../game/content/levels";
import {
  asCollider,
  asGameObject,
  asScene,
  SceneDouble,
} from "../testing/sceneDouble";
import { LevelBuilder } from "./LevelBuilder";
import { MAX_VIEW } from "./viewport";

const buildOn = (scene: SceneDouble, level: LevelDefinition) =>
  new LevelBuilder(asScene(scene)).build(level);

const expectBaseline = (scene: SceneDouble): void => {
  expect(scene.liveObjects()).toHaveLength(0);
  expect(scene.liveTweens()).toHaveLength(0);
  expect(scene.liveTimers()).toHaveLength(0);
  expect(scene.liveColliders()).toHaveLength(0);
  expect(scene.liveGroups()).toHaveLength(0);
  expect(scene.liveBodies()).toHaveLength(0);
};

describe("level lifecycle", () => {
  test("every level loads and unloads back to baseline", () => {
    const scene = new SceneDouble();
    const builder = new LevelBuilder(asScene(scene));

    for (const level of LEVELS) {
      const world = builder.build(level);

      // Everything a running level accumulates hangs off the same world.
      world.collider(asCollider(scene.newCollider()));
      world.delay(1100, () => {});

      expect(scene.liveObjects().length).toBeGreaterThan(0);
      expect(scene.liveTweens().length).toBeGreaterThan(0);
      // Every roof, every platform deck, and the street floor.
      expect(scene.liveBodies().length).toBe(
        level.buildings.length + level.platforms.length + 1,
      );

      world.destroy();
      expectBaseline(scene);
    }

    // Guards against the whole suite passing on an empty build.
    expect(scene.objects.length).toBeGreaterThan(100);
    expect(scene.tweenLog.length).toBeGreaterThan(LEVELS.length);
  });

  test("tearing down twice destroys each object exactly once", () => {
    const scene = new SceneDouble();
    const world = buildOn(scene, LEVELS[0]);

    world.destroy();
    world.destroy();

    expectBaseline(scene);
    expect(scene.objects.every((object) => object.destroyCount === 1)).toBe(
      true,
    );
  });

  test("level timers are cancelled instead of firing into the next level", () => {
    const scene = new SceneDouble();
    const world = buildOn(scene, LEVELS[0]);
    let fired = 0;

    world.delay(1100, () => {
      fired += 1;
    });
    expect(scene.liveTimers()).toHaveLength(1);

    world.destroy();

    expect(scene.liveTimers()).toHaveLength(0);
    scene.runTimer(scene.timerLog[0]);
    expect(fired).toBe(0);
  });

  test("a timer that already fired is not tracked into teardown", () => {
    const scene = new SceneDouble();
    const world = buildOn(scene, LEVELS[0]);
    let fired = 0;

    world.delay(90, () => {
      fired += 1;
    });
    scene.runTimer(scene.timerLog[0]);

    expect(fired).toBe(1);
    expect(scene.liveTimers()).toHaveLength(0);
    world.destroy();
    expect(fired).toBe(1);
  });

  test("an effect that finishes early is retired, not double-destroyed", () => {
    const scene = new SceneDouble();
    const world = buildOn(scene, LEVELS[0]);

    const burst = scene.add.graphics();
    world.track(asGameObject(burst));
    const tween = world.tween({ targets: burst });
    world.discard(asGameObject(burst), tween);

    expect(burst.destroyCount).toBe(1);

    world.destroy();
    expect(burst.destroyCount).toBe(1);
  });
});

describe("backdrop depth", () => {
  test("the painted city lags the camera and the geometry does not", () => {
    const scene = new SceneDouble();
    const level = LEVELS[0];
    buildOn(scene, level);

    const panorama = scene.objects.filter(
      (object) => object.texture === level.backdropKey,
    );
    expect(panorama.length).toBeGreaterThan(0);
    for (const panel of panorama) {
      expect(panel.scrollFactorX).toBeLessThan(1);
      expect(panel.scrollFactorX).toBeGreaterThan(0);
      // Vertically it stays put: a backdrop that lagged the climb would lift
      // off the street line it is drawn to stand on.
      expect(panel.scrollFactorY).toBe(1);
    }

    const cloud = scene.objects.find(
      (object) => object.kind === "tileSprite" && object.depth < -9,
    );
    expect(cloud?.scrollFactorX).toBeLessThan(panorama[0].scrollFactorX);
  });

  test("the panorama covers the whole run at the rate it moves", () => {
    const scene = new SceneDouble();
    const level = LEVELS.reduce((widest, candidate) =>
      candidate.width > widest.width ? candidate : widest,
    );
    buildOn(scene, level);

    const panels = scene.objects.filter(
      (object) => object.texture === level.backdropKey,
    );
    const rate = panels[0].scrollFactorX;
    const painted = Math.max(
      ...panels.map((panel) => panel.x + panel.displayWidth / 2),
    );

    // Furthest the camera can push this layer, plus what is still left of the
    // widest frame it may ever show once it gets there. Measured against the
    // cap the camera is actually held to, so widening the frame cannot quietly
    // outrun the paint.
    expect(painted).toBeGreaterThanOrEqual(
      rate * level.width + MAX_VIEW.width * (1 - rate),
    );
  });
});

describe("weather", () => {
  test("the level owns its rain and stops it on the way out", () => {
    const scene = new SceneDouble();
    const world = buildOn(scene, LEVELS[0]);

    expect(scene.events.count("update")).toBe(1);

    world.destroy();

    expect(scene.events.count("update")).toBe(0);
    expect(scene.events.count("shutdown")).toBe(0);
    expect(scene.liveObjects()).toHaveLength(0);
  });

  test("loading district after district leaves one curtain running", () => {
    const scene = new SceneDouble();
    const builder = new LevelBuilder(asScene(scene));

    for (const level of LEVELS) {
      const world = builder.build(level);
      expect(scene.events.count("update")).toBe(1);
      world.destroy();
      expect(scene.events.count("update")).toBe(0);
    }
  });
});

describe("roof geometry", () => {
  test("roof bodies present their surface at the declared roof line", () => {
    const scene = new SceneDouble();
    const level = LEVELS[0];
    buildOn(scene, level);

    const surfaces = scene.liveBodies().map((body) => ({
      top: body.y - body.displayHeight / 2,
      width: body.displayWidth,
    }));

    for (const { bounds } of level.buildings) {
      expect(
        surfaces.some(
          (surface) =>
            surface.width === bounds.width && surface.top === bounds.y,
        ),
      ).toBe(true);
    }

    const street = surfaces.find((surface) => surface.width === level.width);
    expect(street?.top).toBe(level.streetY);
  });

  /**
   * A platform declares the line an actor stands on, exactly as a roof does.
   * The body hangs below that line rather than straddling it, so a hoist deck
   * and the art drawn on it agree.
   */
  test("platform bodies present their surface at the declared deck line", () => {
    const scene = new SceneDouble();
    const level = LEVELS.find((candidate) => candidate.platforms.length > 0);
    if (!level) {
      throw new Error("No level ships a platform.");
    }
    buildOn(scene, level);

    const surfaces = scene.liveBodies().map((body) => ({
      top: body.y - body.displayHeight / 2,
      width: body.displayWidth,
    }));

    for (const platform of level.platforms) {
      expect(
        surfaces.some(
          (surface) =>
            surface.width === platform.bounds.width &&
            surface.top === platform.bounds.y,
        ),
      ).toBe(true);
    }
  });
});

describe("cables and platforms", () => {
  const levelWith = (has: (level: LevelDefinition) => boolean) => {
    const level = LEVELS.find(has);
    if (!level) {
      throw new Error("No level matches.");
    }
    return level;
  };

  test("a cable draws its own line and both masts, and takes them away", () => {
    const scene = new SceneDouble();
    const level = levelWith((candidate) => candidate.cables.length > 0);

    const world = buildOn(scene, level);
    const graphics = scene
      .liveObjects()
      .filter((object) => object.kind === "graphics");
    // One stroked line per cable, plus one rail per mover, plus the single
    // sheet the rain strikes its rooftop splashes into.
    const movers = level.platforms.filter(
      (platform) => platform.motion !== undefined,
    ).length;
    expect(graphics).toHaveLength(level.cables.length + movers + 1);

    world.destroy();
    expect(
      scene.objects.filter(
        (object) => object.kind === "graphics" && !object.destroyed,
      ),
    ).toHaveLength(0);
  });

  test("each mover and each phasing ledge is driven by one owned tween", () => {
    const scene = new SceneDouble();
    const level = levelWith((candidate) =>
      candidate.platforms.some((platform) => platform.cycle !== undefined),
    );
    const driven = level.platforms.filter(
      (platform) =>
        platform.motion !== undefined || platform.cycle !== undefined,
    ).length;

    const before = scene.tweenLog.length;
    const world = buildOn(scene, level);
    // Every driver tween runs on a plain schedule object, never on a display
    // object — a tween whose target is destroyed first would still be live.
    const drivers = scene.tweenLog
      .slice(before)
      .filter(
        (tween) =>
          typeof tween.targets === "object" &&
          tween.targets !== null &&
          "t" in (tween.targets as Record<string, unknown>),
      );
    expect(drivers).toHaveLength(driven);

    world.destroy();
    expect(drivers.every((tween) => tween.removed)).toBe(true);
  });
});

describe("geometry validation", () => {
  const withOverrides = (overrides: Partial<LevelDefinition>) => ({
    ...LEVELS[0],
    ...overrides,
  });

  const cases: [string, LevelDefinition][] = [
    ["a zero-width level", withOverrides({ width: 0 })],
    ["a street below the level floor", withOverrides({ streetY: 4000 })],
    [
      "a negative building",
      withOverrides({
        buildings: [
          { kind: "block", bounds: { x: 0, y: 900, width: -320, height: 400 } },
        ],
      }),
    ],
    [
      "a goal with no radius",
      withOverrides({ goal: { ...LEVELS[0].goal, radius: 0 } }),
    ],
  ];

  for (const [name, level] of cases) {
    test(`rejects ${name} before creating anything`, () => {
      const scene = new SceneDouble();

      expect(() => buildOn(scene, level)).toThrow(/Cannot build level/);
      expect(scene.objects).toHaveLength(0);
      expect(scene.tweenLog).toHaveLength(0);
      expect(scene.groupLog).toHaveLength(0);
    });
  }

  test("accepts every shipped level", () => {
    const scene = new SceneDouble();

    for (const level of LEVELS) {
      expect(() => buildOn(scene, level).destroy()).not.toThrow();
    }
  });
});
