import { describe, expect, test } from "bun:test";
import { LEVELS, type LevelDefinition } from "../../game/content/levels";
import {
  asCollider,
  asGameObject,
  asScene,
  SceneDouble,
} from "../testing/sceneDouble";
import { LevelBuilder } from "./LevelBuilder";

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
      expect(scene.liveBodies().length).toBe(level.buildings.length + 1);

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
