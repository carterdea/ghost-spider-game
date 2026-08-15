import { describe, expect, test } from "bun:test";
import type Phaser from "phaser";
import { LEVELS } from "../../game/content/levels";
import { createEmptyActions } from "../../game/input/actions";
import {
  createInitialGameState,
  type GameState,
} from "../../game/simulation/state";
import { ARSENAL } from "../../game/simulation/systems/weapons";
import type { RunFeedback } from "../scenes/feedback";
import { asScene, SceneDouble } from "../testing/sceneDouble";
import type { EnemyDirector } from "./EnemyDirector";
import { PlayerController } from "./PlayerController";
import { BODY_BOXES } from "./placement";
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

const rackFor = (
  state: GameState,
  controller = {} as unknown as PlayerController,
): WeaponRack =>
  new WeaponRack({
    scene: asScene(new SceneDouble()),
    state,
    // None of these is reached by the shield; a rack that starts touching them
    // should fail loudly here rather than quietly pass.
    enemies: {} as unknown as EnemyDirector,
    feedback: {} as unknown as RunFeedback,
    controller,
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

const FRAME_MS = 1000 / 60;

/**
 * The hero as both the rack and the controller see them: a transform, a facing,
 * and the slice of an Arcade body the controller writes velocity through.
 */
class HeroStub {
  public x = 400;
  public y = 800;
  public flipX = false;
  public angle = 0;
  public readonly scaleY = 1;
  public readonly displayOriginY = 96;
  public readonly velocity = { x: 0, y: 0 };
  public readonly body = {
    offset: { y: BODY_BOXES.hero.offsetY },
    height: BODY_BOXES.hero.height,
    blocked: { none: true, up: false, down: false, left: false, right: false },
    touching: { none: true, up: false, down: false, left: false, right: false },
    setAllowGravity: (): unknown => undefined,
    setAllowDrag: (): unknown => undefined,
    reset: (x: number, y: number): void => {
      this.setPosition(x, y);
      this.setVelocity(0, 0);
    },
  };
  public readonly scene = { time: { now: 0 } };

  public setPosition(x: number, y: number): this {
    this.x = x;
    this.y = y;
    return this;
  }

  public setVelocity(x: number, y: number): this {
    this.velocity.x = x;
    this.velocity.y = y;
    return this;
  }

  public setMaxVelocity(): this {
    return this;
  }

  public setAngle(value: number): this {
    this.angle = value;
    return this;
  }

  public clearTint(): this {
    return this;
  }
}

const asHero = (stub: HeroStub): Phaser.Physics.Arcade.Sprite =>
  stub as unknown as Phaser.Physics.Arcade.Sprite;

/**
 * The vault is the one weapon that moves the hero, and the hero's motion is the
 * simulation's — the controller hands Arcade a fresh velocity every frame, so a
 * write straight to the body survived exactly one 1/60 step and about seven
 * pixels of lift before `commit` erased it.
 */
describe("the web-wings", () => {
  const vaulted = (): { stub: HeroStub; controller: PlayerController } => {
    const stub = new HeroStub();
    const controller = new PlayerController(asHero(stub));
    controller.reset({ x: stub.x, y: stub.y });

    const state = createInitialGameState(LEVELS[0]);
    state.player.gadget = "web-wings";
    rackFor(state, controller).use(asHero(stub), { scene: 0, run: 0 });
    return { stub, controller };
  };

  test("still lifts the hero after the frame the sim commits", () => {
    const { stub, controller } = vaulted();

    controller.update(createEmptyActions(), false, false, [], 2000, FRAME_MS);

    expect(stub.velocity.y).toBeLessThan(-300);
  });

  test("leaves the run the hero is already on alone", () => {
    const { stub, controller } = vaulted();

    controller.update(
      { ...createEmptyActions(), moveRight: true },
      false,
      false,
      [],
      2000,
      FRAME_MS,
    );

    expect(stub.velocity.x).toBeGreaterThan(0);
    expect(stub.velocity.y).toBeLessThan(-300);
  });
});

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
