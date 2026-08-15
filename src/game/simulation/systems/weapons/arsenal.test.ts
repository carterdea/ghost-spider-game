import { describe, expect, test } from "bun:test";
import {
  ARSENAL,
  canFire,
  createArsenal,
  GADGET_ORDER,
  gadgetAt,
  nextGadget,
  rechargeProgress,
  refillArsenal,
  spendCharge,
  tickArsenal,
} from "./arsenal";

const BOMB = ARSENAL["web-bomb"];

describe("the table", () => {
  test("every weapon in the cycle is carried and comes back", () => {
    for (const kind of GADGET_ORDER) {
      const spec = ARSENAL[kind];
      expect(spec.capacity).toBeGreaterThan(0);
      expect(spec.rechargeMs).toBeGreaterThan(0);
      expect(spec.cooldownMs).toBeGreaterThan(0);
    }
  });

  test("the cycle holds every weapon exactly once", () => {
    expect(new Set(GADGET_ORDER).size).toBe(GADGET_ORDER.length);
    expect(GADGET_ORDER.length).toBe(Object.keys(ARSENAL).length);
  });

  test("the bomb is the scarcest thing the hero carries", () => {
    for (const kind of GADGET_ORDER) {
      if (kind === "web-bomb") {
        continue;
      }
      expect(BOMB.rechargeMs).toBeGreaterThan(ARSENAL[kind].rechargeMs);
    }
  });
});

describe("spending", () => {
  test("a fresh arsenal is full and every slot is ready", () => {
    const arsenal = createArsenal();

    for (const kind of GADGET_ORDER) {
      expect(arsenal.charges[kind]).toBe(ARSENAL[kind].capacity);
      expect(arsenal.refillAt[kind]).toBeNull();
      expect(canFire(arsenal, kind, 0)).toBe(true);
    }
  });

  test("a charge is spent and a recharge is put in flight", () => {
    const arsenal = createArsenal();

    expect(spendCharge(arsenal, "web-bomb", 1000)).toBe(true);
    expect(arsenal.charges["web-bomb"]).toBe(BOMB.capacity - 1);
    expect(arsenal.refillAt["web-bomb"]).toBe(1000 + BOMB.rechargeMs);
  });

  test("an empty slot cannot be fired and stays empty", () => {
    const arsenal = createArsenal();
    let now = 0;

    for (let shot = 0; shot < BOMB.capacity; shot += 1) {
      expect(spendCharge(arsenal, "web-bomb", now)).toBe(true);
      now += BOMB.cooldownMs;
    }

    expect(arsenal.charges["web-bomb"]).toBe(0);
    expect(canFire(arsenal, "web-bomb", now)).toBe(false);
    expect(spendCharge(arsenal, "web-bomb", now)).toBe(false);
    expect(arsenal.charges["web-bomb"]).toBe(0);
  });

  test("the cooldown is shared, so no weapon can be dumped in one frame", () => {
    const arsenal = createArsenal();

    expect(spendCharge(arsenal, "web-net", 0)).toBe(true);
    expect(canFire(arsenal, "web-bomb", 0)).toBe(false);
    expect(spendCharge(arsenal, "web-bomb", 0)).toBe(false);
    expect(arsenal.charges["web-bomb"]).toBe(BOMB.capacity);

    const lifted = ARSENAL["web-net"].cooldownMs;
    expect(canFire(arsenal, "web-bomb", lifted)).toBe(true);
  });

  test("spending again does not push back a recharge already in flight", () => {
    const arsenal = createArsenal();

    spendCharge(arsenal, "web-net", 0);
    const due = arsenal.refillAt["web-net"];
    spendCharge(arsenal, "web-net", ARSENAL["web-net"].cooldownMs);

    expect(arsenal.refillAt["web-net"]).toBe(due);
  });
});

describe("recharging", () => {
  test("a charge lands exactly when it comes due, and not before", () => {
    const arsenal = createArsenal();
    spendCharge(arsenal, "web-bomb", 0);

    tickArsenal(arsenal, BOMB.rechargeMs - 1);
    expect(arsenal.charges["web-bomb"]).toBe(BOMB.capacity - 1);

    tickArsenal(arsenal, BOMB.rechargeMs);
    expect(arsenal.charges["web-bomb"]).toBe(BOMB.capacity);
    expect(arsenal.refillAt["web-bomb"]).toBeNull();
  });

  test("a stalled frame hands back every charge it owes, and no more", () => {
    const arsenal = createArsenal();
    let now = 0;
    for (let shot = 0; shot < BOMB.capacity; shot += 1) {
      spendCharge(arsenal, "web-bomb", now);
      now += BOMB.cooldownMs;
    }
    expect(arsenal.charges["web-bomb"]).toBe(0);

    tickArsenal(arsenal, 60_000);

    expect(arsenal.charges["web-bomb"]).toBe(BOMB.capacity);
    expect(arsenal.refillAt["web-bomb"]).toBeNull();
  });

  test("charges land one at a time rather than all at once", () => {
    const arsenal = createArsenal();
    spendCharge(arsenal, "impact-web", 0);
    spendCharge(arsenal, "impact-web", ARSENAL["impact-web"].cooldownMs);
    expect(arsenal.charges["impact-web"]).toBe(
      ARSENAL["impact-web"].capacity - 2,
    );

    tickArsenal(arsenal, ARSENAL["impact-web"].rechargeMs);
    expect(arsenal.charges["impact-web"]).toBe(
      ARSENAL["impact-web"].capacity - 1,
    );

    tickArsenal(arsenal, ARSENAL["impact-web"].rechargeMs * 2);
    expect(arsenal.charges["impact-web"]).toBe(ARSENAL["impact-web"].capacity);
  });

  test("a full weapon reports no progress to make", () => {
    const arsenal = createArsenal();
    expect(rechargeProgress(arsenal, "web-bomb", 0)).toBe(1);
  });

  test("progress climbs across the wait and is clamped at both ends", () => {
    const arsenal = createArsenal();
    spendCharge(arsenal, "web-bomb", 0);

    expect(rechargeProgress(arsenal, "web-bomb", 0)).toBe(0);
    expect(rechargeProgress(arsenal, "web-bomb", BOMB.rechargeMs / 2)).toBe(
      0.5,
    );
    expect(rechargeProgress(arsenal, "web-bomb", BOMB.rechargeMs * 4)).toBe(1);
  });

  test("a resupply fills every slot and clears the cooldown", () => {
    const arsenal = createArsenal();
    spendCharge(arsenal, "web-bomb", 500);
    spendCharge(arsenal, "web-net", 2000);

    refillArsenal(arsenal);

    for (const kind of GADGET_ORDER) {
      expect(arsenal.charges[kind]).toBe(ARSENAL[kind].capacity);
      expect(arsenal.refillAt[kind]).toBeNull();
    }
    expect(arsenal.readyAt).toBe(0);
  });
});

describe("selection", () => {
  test("cycling walks the order and wraps in both directions", () => {
    const first = GADGET_ORDER[0];
    const last = GADGET_ORDER[GADGET_ORDER.length - 1];

    expect(nextGadget(first)).toBe(GADGET_ORDER[1]);
    expect(nextGadget(last)).toBe(first);
    expect(nextGadget(first, -1)).toBe(last);
  });

  test("a slot maps to its weapon, and an empty slot to nothing", () => {
    expect(gadgetAt(0)).toBe(GADGET_ORDER[0]);
    expect(gadgetAt(GADGET_ORDER.length)).toBeUndefined();
    expect(gadgetAt(-1)).toBeUndefined();
  });
});
