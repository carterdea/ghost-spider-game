import { describe, expect, test } from "bun:test";
import type Phaser from "phaser";
import { LEVELS } from "../../game/content/levels";
import {
  createInitialGameState,
  type GameState,
} from "../../game/simulation/state";
import { ARSENAL } from "../../game/simulation/systems/weapons";
import type { RunFeedback } from "../scenes/feedback";
import { asScene, SceneDouble } from "../testing/sceneDouble";
import type { EnemyDirector } from "./EnemyDirector";
import { WeaponRack } from "./WeaponRack";

/**
 * The shield is the one weapon that reaches nothing outside the rack when it
 * fires — no shot, no charge, no sprite — so a rack can be exercised through
 * its real `use` path without a booted world behind it.
 */
const SHIELD = ARSENAL["web-shield"];

/** The hero, as the shield sees them: a position and a facing. */
const hero = {
  x: 0,
  y: 0,
  flipX: false,
} as unknown as Phaser.Physics.Arcade.Sprite;

const rackFor = (state: GameState): WeaponRack =>
  new WeaponRack({
    scene: asScene(new SceneDouble()),
    state,
    // Neither is reached by the shield; a rack that starts touching them
    // should fail loudly here rather than quietly pass.
    enemies: {} as unknown as EnemyDirector,
    feedback: {} as unknown as RunFeedback,
    play: () => {},
  });

const drainedRack = (): { rack: WeaponRack; at: number } => {
  const state = createInitialGameState(LEVELS[0]);
  state.player.gadget = "web-shield";
  const rack = rackFor(state);

  let at = 0;
  for (let shot = 0; shot < SHIELD.capacity; shot += 1) {
    rack.use(hero, { scene: at, run: at });
    at += SHIELD.cooldownMs;
  }

  expect(rack.ammo.charges["web-shield"]).toBe(0);
  return { rack, at };
};

describe("the arsenal's clock", () => {
  /**
   * The run timer freezes on a pause and the scene's clock does not, so an
   * arsenal recharging off the scene's clock handed the whole thing back for
   * nothing: drain it, hold the game for twelve seconds, resume with a full
   * pouch and a run time unchanged.
   */
  test("a pause buys no charges, however long it is held", () => {
    const { rack, at } = drainedRack();

    // Fourteen seconds of wall time — twice the shield's recharge — during
    // which the run clock does not move at all.
    rack.update({ scene: at + 14000, run: at });

    expect(rack.ammo.charges["web-shield"]).toBe(0);
  });

  test("time actually played does pay for a charge", () => {
    const { rack, at } = drainedRack();

    rack.update({ scene: at + 60000, run: at + SHIELD.rechargeMs });

    expect(rack.ammo.charges["web-shield"]).toBe(1);
  });

  /**
   * The shared cooldown is on the same clock as the charges, or a pause would
   * lift it early for exactly the same reason.
   */
  test("the shared cooldown is not lifted by a pause either", () => {
    const state = createInitialGameState(LEVELS[0]);
    state.player.gadget = "web-shield";
    const rack = rackFor(state);

    rack.use(hero, { scene: 0, run: 0 });
    expect(rack.ammo.charges["web-shield"]).toBe(SHIELD.capacity - 1);

    // Held well past the cooldown by the wall clock, but no time played.
    rack.use(hero, { scene: 30000, run: 0 });

    expect(rack.ammo.charges["web-shield"]).toBe(SHIELD.capacity - 1);
    expect(rack.ready({ scene: 30000, run: 0 })).toBe(false);
    expect(rack.ready({ scene: 30000, run: SHIELD.cooldownMs })).toBe(true);
  });
});
