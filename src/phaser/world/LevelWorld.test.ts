import { describe, expect, test } from "bun:test";
import { asScene, SceneDouble } from "../testing/sceneDouble";
import { LevelWorld } from "./LevelWorld";

/**
 * A pause holds Arcade and the tweens, but the scene clock keeps counting.
 * Everything the level schedules — a shot's lifetime, most of all — runs on
 * that clock, so the hold has to reach it too.
 */
describe("holding a level", () => {
  const worldWithShot = (): {
    world: LevelWorld;
    scene: SceneDouble;
    fired: () => number;
  } => {
    const scene = new SceneDouble();
    const world = new LevelWorld(asScene(scene));
    let count = 0;
    world.delay(620, () => {
      count += 1;
    });
    return { world, scene, fired: () => count };
  };

  test("a held timer does not spend its lifetime", () => {
    const { world, scene, fired } = worldWithShot();

    world.hold(true);
    for (const timer of scene.timerLog) {
      scene.runTimer(timer);
    }

    // The shot is motionless on screen; destroying it here spends a charge on
    // flight the player never gets.
    expect(fired()).toBe(0);
  });

  test("releasing the hold lets it run out as before", () => {
    const { world, scene, fired } = worldWithShot();

    world.hold(true);
    world.hold(false);
    for (const timer of scene.timerLog) {
      scene.runTimer(timer);
    }

    expect(fired()).toBe(1);
  });

  test("a timer scheduled before the hold is caught by it", () => {
    const { world, scene } = worldWithShot();

    world.hold(true);

    expect(scene.timerLog.every((timer) => timer.paused)).toBe(true);
  });

  test("tearing the level down drops held timers rather than stranding them", () => {
    const { world, scene, fired } = worldWithShot();

    world.hold(true);
    world.destroy();
    for (const timer of scene.timerLog) {
      scene.runTimer(timer);
    }

    expect(fired()).toBe(0);
    expect(scene.liveTimers()).toHaveLength(0);
  });
});
