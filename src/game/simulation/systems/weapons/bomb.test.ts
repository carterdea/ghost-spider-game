import { describe, expect, test } from "bun:test";
import type { Vec2 } from "../../physics/vector";
import {
  type BurstTarget,
  burstDamage,
  catchInBurst,
  fuseEndsAt,
  fuseProgress,
  throwVelocity,
  WEB_BOMB,
} from "./bomb";

const at = (x: number, y: number): Vec2 => ({ x, y });

const target = (id: string, x: number, y: number): BurstTarget => ({
  id,
  position: at(x, y),
});

describe("the fuse", () => {
  test("a charge that just stuck has a full fuse ahead of it", () => {
    const burstAt = fuseEndsAt(1000);

    expect(burstAt).toBe(1000 + WEB_BOMB.fuseMs);
    expect(fuseProgress(burstAt, 1000)).toBe(0);
  });

  test("the telegraph runs from nothing to full across the fuse", () => {
    const burstAt = fuseEndsAt(0);

    expect(fuseProgress(burstAt, WEB_BOMB.fuseMs / 2)).toBeCloseTo(0.5, 5);
    expect(fuseProgress(burstAt, WEB_BOMB.fuseMs)).toBe(1);
  });

  test("the telegraph is clamped, so a late frame never overshoots", () => {
    const burstAt = fuseEndsAt(0);

    expect(fuseProgress(burstAt, -500)).toBe(0);
    expect(fuseProgress(burstAt, WEB_BOMB.fuseMs * 10)).toBe(1);
  });
});

describe("burst damage", () => {
  test("the core pays in full", () => {
    expect(burstDamage(0)).toBe(WEB_BOMB.coreDamage);
  });

  test("the rim pays its share, and nothing beyond it pays at all", () => {
    expect(burstDamage(WEB_BOMB.radius)).toBe(
      Math.round(WEB_BOMB.coreDamage * WEB_BOMB.rimShare),
    );
    expect(burstDamage(WEB_BOMB.radius + 1)).toBe(0);
  });

  test("damage falls off as the gap grows", () => {
    const near = burstDamage(WEB_BOMB.radius * 0.25);
    const mid = burstDamage(WEB_BOMB.radius * 0.5);
    const far = burstDamage(WEB_BOMB.radius * 0.9);

    expect(near).toBeGreaterThan(mid);
    expect(mid).toBeGreaterThan(far);
    expect(far).toBeGreaterThan(0);
  });
});

describe("what the mesh catches", () => {
  test("everything inside the radius, whatever direction it lies in", () => {
    const hits = catchInBurst(at(0, 0), [
      target("left", -120, 0),
      target("above", 0, -150),
      target("below", 30, 90),
    ]);

    expect(hits.map((hit) => hit.id).sort()).toEqual([
      "above",
      "below",
      "left",
    ]);
  });

  test("nothing outside the radius, however narrowly it missed", () => {
    const hits = catchInBurst(at(0, 0), [
      target("inside", WEB_BOMB.radius - 1, 0),
      target("outside", WEB_BOMB.radius + 1, 0),
    ]);

    expect(hits).toHaveLength(1);
    expect(hits[0].id).toBe("inside");
  });

  test("a target sitting on the rim is still caught", () => {
    const hits = catchInBurst(at(0, 0), [target("rim", WEB_BOMB.radius, 0)]);

    expect(hits).toHaveLength(1);
    expect(hits[0].damage).toBeGreaterThan(0);
  });

  test("each target is caught exactly once, nearest first", () => {
    const hits = catchInBurst(at(100, 100), [
      target("far", 100, 260),
      target("near", 110, 100),
      target("mid", 100, 20),
    ]);

    expect(hits.map((hit) => hit.id)).toEqual(["near", "mid", "far"]);
    expect(hits[0].damage).toBeGreaterThan(hits[2].damage);
  });

  test("a burst with nothing in reach catches nothing", () => {
    expect(catchInBurst(at(0, 0), [target("away", 4000, 4000)])).toEqual([]);
    expect(catchInBurst(at(0, 0), [])).toEqual([]);
  });

  test("a cluster pays far better than a lone patrol", () => {
    const lone = catchInBurst(at(0, 0), [target("a", 40, 0)]);
    const cluster = catchInBurst(at(0, 0), [
      target("a", 40, 0),
      target("b", -30, 40),
      target("c", 10, -60),
    ]);

    const total = (hits: readonly { damage: number }[]) =>
      hits.reduce((sum, hit) => sum + hit.damage, 0);

    expect(total(cluster)).toBeGreaterThan(total(lone) * 2);
  });
});

describe("the throw", () => {
  test("it leaves in the direction the hero faces, and it arcs", () => {
    const right = throwVelocity(1, at(0, 0));
    const left = throwVelocity(-1, at(0, 0));

    expect(right.x).toBe(WEB_BOMB.throwSpeed);
    expect(left.x).toBe(-WEB_BOMB.throwSpeed);
    expect(right.y).toBeLessThan(0);
  });

  test("a charge thrown from a fast swing carries the swing with it", () => {
    const still = throwVelocity(1, at(0, 0));
    const moving = throwVelocity(1, at(900, 0));

    expect(moving.x).toBeGreaterThan(still.x);
    expect(moving.x).toBe(still.x + 900 * WEB_BOMB.inheritance);
  });

  test("a charge thrown backwards out of a run still travels backwards", () => {
    expect(throwVelocity(-1, at(600, 0)).x).toBeLessThan(0);
  });
});
