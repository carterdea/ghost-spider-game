import { describe, expect, test } from "bun:test";
import type { Rect, Vec2 } from "../../physics/vector";
import {
  type AimTarget,
  IMPACT_WEB,
  knockbackVelocity,
  pickYankTarget,
  WEB_LINE,
  yankVelocity,
} from "./strike";

const at = (x: number, y: number): Vec2 => ({ x, y });

const target = (id: string, x: number, y: number): AimTarget => ({
  id,
  position: at(x, y),
});

describe("the impact web", () => {
  test("it throws the target away from the hero, and upwards", () => {
    const right = knockbackVelocity(1);
    const left = knockbackVelocity(-1);

    expect(right.x).toBe(IMPACT_WEB.knockbackX);
    expect(left.x).toBe(-IMPACT_WEB.knockbackX);
    expect(right.y).toBeLessThan(0);
    expect(left.y).toBe(right.y);
  });

  test("the hold is shorter than the stagger, so it lands then stays down", () => {
    expect(IMPACT_WEB.holdMs).toBeLessThan(IMPACT_WEB.staggerMs);
  });
});

describe("the web line", () => {
  test("it drags the target toward the hero", () => {
    const pulled = yankVelocity(at(400, 100), at(0, 100));

    expect(pulled.x).toBeLessThan(0);
    expect(Math.abs(pulled.x)).toBeCloseTo(WEB_LINE.pullSpeed, 5);
  });

  test("a target level with the hero is still lifted clear of its roof", () => {
    expect(yankVelocity(at(400, 100), at(0, 100)).y).toBe(WEB_LINE.lift);
  });

  test("the pull is the same speed whatever the distance", () => {
    const near = yankVelocity(at(60, 0), at(0, 0));
    const far = yankVelocity(at(500, 0), at(0, 0));

    expect(near.x).toBeCloseTo(far.x, 5);
  });
});

describe("picking a target to yank", () => {
  const hero = at(0, 0);
  const pick = (
    facing: -1 | 1,
    targets: readonly AimTarget[],
    cover: readonly Rect[] = [],
  ) => pickYankTarget(hero, facing, targets, cover);

  test("the nearest thing in front", () => {
    const picked = pick(1, [target("far", 400, 0), target("near", 150, 20)]);

    expect(picked?.id).toBe("near");
  });

  test("nothing behind the hero, however close", () => {
    expect(pick(1, [target("behind", -80, 0)])).toBeNull();
    expect(pick(-1, [target("ahead", 80, 0)])).toBeNull();
  });

  test("facing the other way picks the other target", () => {
    const both = [target("right", 200, 0), target("left", -200, 0)];

    expect(pick(1, both)?.id).toBe("right");
    expect(pick(-1, both)?.id).toBe("left");
  });

  test("nothing beyond the reach of the line", () => {
    expect(pick(1, [target("edge", WEB_LINE.reach - 1, 0)])?.id).toBe("edge");
    expect(pick(1, [target("gone", WEB_LINE.reach + 1, 0)])).toBeNull();
  });

  test("a target well off the facing axis falls outside the cone", () => {
    expect(pick(1, [target("overhead", 10, -300)])).toBeNull();
    expect(pick(1, [target("below", 300, 200)])?.id).toBe("below");
  });

  test("an empty sky yields nothing", () => {
    expect(pick(1, [])).toBeNull();
  });

  test("nothing through a building", () => {
    const facade = { x: 100, y: -100, width: 40, height: 200 };
    const sheltered = [target("sheltered", 300, 0)];

    expect(pick(1, sheltered, [facade])).toBeNull();
    // The same target once the wall is moved off the line.
    expect(pick(1, sheltered, [{ ...facade, y: 400 }])?.id).toBe("sheltered");
  });

  test("cover does not settle for nothing when a target is still open", () => {
    // The near one is behind a wall, the far one is out in the street below.
    // Nearest wins, so a blocked target must be skipped rather than end the
    // search holding the best gap.
    const facade = { x: 100, y: -40, width: 40, height: 80 };

    expect(
      pick(1, [target("sheltered", 150, 0), target("open", 400, 200)], [facade])
        ?.id,
    ).toBe("open");
  });
});
