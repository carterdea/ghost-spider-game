import { describe, expect, test } from "bun:test";
import type Phaser from "phaser";
import { LEVELS } from "../../game/content/levels";
import { createInitialGameState } from "../../game/simulation/state";
import {
  asScene,
  type FakeGroup,
  type FakeSprite,
  SceneDouble,
} from "../testing/sceneDouble";
import { EnemyDirector, type EnemyView } from "./EnemyDirector";

/**
 * The director keeps every deadline an enemy is owed — a snare, a knockback,
 * a shot's remaining flight — and each one was measured against the scene clock
 * at some point, which runs through a pause and through the hit-stop after a
 * landed blow. Three separate bugs came out of that.
 *
 * Every test here parks wall time far in the future. Nothing the director does
 * should notice: if any deadline goes back to reading `scene.time.now`, these
 * fail rather than drifting quietly.
 */

/** Far past every duration in the file, so a wall-clock read cannot pass. */
const WALL_CLOCK = 500_000;

const spriteOf = (view: EnemyView): FakeSprite =>
  view.sprite as unknown as FakeSprite;

interface Harness {
  scene: SceneDouble;
  director: EnemyDirector;
  player: Phaser.Physics.Arcade.Sprite;
  views: readonly EnemyView[];
}

const setUp = (levelIndex: number): Harness => {
  const scene = new SceneDouble();
  const level = LEVELS[levelIndex];
  const state = createInitialGameState(level, "playing");
  const director = new EnemyDirector(asScene(scene));

  director.spawn(level, state, scene.physics.add.staticGroup() as never);
  scene.now = WALL_CLOCK;

  return {
    scene,
    director,
    views: director.all,
    player: scene.physics.add.sprite(0, 0, "hero") as never,
  };
};

/** Runs `ms` of simulation at a normal frame, the way a live run would. */
const play = (harness: Harness, ms: number, frameMs = 16): void => {
  for (let elapsed = 0; elapsed < ms; elapsed += frameMs) {
    harness.director.update(frameMs, harness.player);
  }
};

describe("a snare", () => {
  test("holds an enemy still for the time it was promised", () => {
    const harness = setUp(1);
    const view = harness.views[0];

    harness.director.snare(view);
    play(harness, 600);

    expect(spriteOf(view).body.velocity.x).toBe(0);
  });

  test("is spent by the run, not by the clock on the wall", () => {
    const held = setUp(1);
    const free = setUp(1);

    held.director.snare(held.views[0]);
    // Half a second of play against half a minute of wall time: only the
    // first should count against the hold.
    play(held, 500);
    held.scene.now = WALL_CLOCK * 2;
    play(held, 100);

    play(free, 2400);

    expect(spriteOf(held.views[0]).body.velocity.x).toBe(0);
    // The control: the same enemy left alone does get moving, so the
    // assertion above is about the snare and not about a stationary patrol.
    expect(spriteOf(free.views[0]).body.velocity.x).not.toBe(0);
  });
});

describe("a knockback", () => {
  test("is not eaten by the freeze the blow that caused it bought", () => {
    const harness = setUp(1);
    const view = harness.views[0];

    harness.director.launch(view, { x: 420, y: -260 }, 300);
    // A landed blow freezes the world: frames keep arriving at their usual
    // cadence and wall time keeps running, but almost no simulation passes.
    // 480ms on the wall against 30ms played — well past the throw by one
    // clock and nowhere near it by the other.
    for (let frame = 0; frame < 30; frame += 1) {
      harness.director.update(1, harness.player);
      harness.scene.now += 16;
    }

    // Still flying where the weapon threw it. Measured on the wall clock the
    // throw would already be spent, and the brain would have taken the body
    // back before it travelled anywhere.
    expect(spriteOf(view).body.velocity.x).toBe(420);
  });

  test("ends once the throw has actually been flown", () => {
    const harness = setUp(1);
    const view = harness.views[0];

    harness.director.launch(view, { x: 420, y: -260 }, 300);
    play(harness, 600);

    expect(spriteOf(view).body.velocity.x).not.toBe(420);
  });
});

describe("the brains", () => {
  test("do not run while the world is frozen", () => {
    const harness = setUp(1);
    const view = harness.views[0];

    play(harness, 200);
    const phase = view.brain.phase;

    // A fully held frame still arrives; it just carries no simulation.
    for (let frame = 0; frame < 10; frame += 1) {
      harness.director.update(0, harness.player);
      harness.scene.now += 16;
    }

    expect(view.brain.phase).toBe(phase);
  });

  test("run again as soon as it is released", () => {
    const harness = setUp(1);
    const view = harness.views[0];

    const phase = view.brain.phase;
    play(harness, 100);

    expect(view.brain.phase).toBeGreaterThan(phase);
  });
});

describe("a net on the boss", () => {
  /** The Weaver, dropped into a harness that already has a level loaded. */
  const withBoss = () => {
    const harness = setUp(1);
    const state = createInitialGameState(LEVELS[1], "playing");
    const boss = harness.director.spawnBoss(
      {
        id: "the-weaver",
        position: { x: 800, y: 400 },
        arena: { x: 0, y: 150, width: 3000, height: 900 },
        health: 260,
        damage: 10,
        speed: 260,
      },
      state,
    );
    return { harness, boss };
  };

  test("a sleeping Weaver can still be shot awake from across the arena", () => {
    const { harness, boss } = withBoss();
    // The hero stays well outside the wake radius, so proximity cannot be what
    // starts the fight.
    (harness.player as unknown as FakeSprite).setPosition(-2000, 1200);
    play(harness, 200);

    // Nothing is open yet because there are no windows yet. Closed here made
    // the brain's only ranged wake — taking damage — impossible to reach.
    expect(boss.boss?.intent.state).toBe("dormant");
    expect(boss.state.invulnerable).toBe(false);
  });

  test("but closes again the moment the fight is actually on", () => {
    const { harness, boss } = withBoss();
    (harness.player as unknown as FakeSprite).setPosition(820, 420);
    play(harness, 1200);

    expect(boss.boss?.intent.state).not.toBe("dormant");
    // Awake and outside a punish window: the gate is doing its job.
    expect(boss.state.invulnerable).toBe(!boss.boss?.intent.vulnerable);
  });

  test("lands the first time", () => {
    const { harness, boss } = withBoss();

    harness.director.snare(boss);

    expect(boss.snaredUntil).toBeGreaterThan(harness.director.now);
  });

  test("thrown inside the lock leaves no mark to cash in later", () => {
    const { harness, boss } = withBoss();
    if (!boss.boss) {
      throw new Error("the boss view has no runtime");
    }

    // The immunity is up: the brain already ignores a net here. Stamping the
    // deadline anyway only queued it — the physical snare outlived the lock,
    // and the frame the lock hit zero the brain staggered on a net thrown
    // seconds earlier.
    boss.boss.memory.snareLock = 3.6;
    harness.director.snare(boss);

    expect(boss.snaredUntil).toBe(0);
  });

  test("lands again once the lock has run out", () => {
    const { harness, boss } = withBoss();
    if (!boss.boss) {
      throw new Error("the boss view has no runtime");
    }

    boss.boss.memory.snareLock = 3.6;
    harness.director.snare(boss);
    boss.boss.memory.snareLock = 0;
    harness.director.snare(boss);

    expect(boss.snaredUntil).toBeGreaterThan(harness.director.now);
  });
});

describe("a gunner's shot", () => {
  /** Stands the hero where the gunner can see them and lets it open fire. */
  const openFire = (levelIndex: number) => {
    const harness = setUp(levelIndex);
    const gunner = harness.views.find((view) => view.state.kind === "gunner");
    if (!gunner) {
      throw new Error(`level ${levelIndex} authors no gunner`);
    }
    // Ahead of it: the sight cone follows the way an enemy faces, and they
    // all start facing right.
    (harness.player as unknown as FakeSprite).setPosition(
      gunner.sprite.x + 200,
      gunner.sprite.y,
    );
    play(harness, 4800);

    const shots = (
      harness.director.bullets as unknown as FakeGroup
    ).getChildren();
    return { gunner, shots };
  };

  test("costs what the enemy firing it was authored for", () => {
    const { gunner, shots } = openFire(2);

    expect(shots.length).toBeGreaterThan(0);
    for (const shot of shots) {
      expect(shot.getData("damage")).toBe(gunner.contactDamage);
    }
  });

  test("hits harder in a later district, which is what authoring it is for", () => {
    const early = openFire(2);
    const finale = openFire(7);

    // A gunner never sets a contact strike, so the bullet is the only route
    // its number takes. Hard-coded, every gunner in the game hit for 12 and
    // the whole threat curve stopped at the district boundary.
    expect(early.shots[0].getData("damage")).toBe(16);
    expect(finale.shots[0].getData("damage")).toBe(22);
  });
});

describe("a shot in the air", () => {
  test("spends its life flying rather than waiting", () => {
    const harness = setUp(1);
    const bullet = harness.director.bullets.create(
      0,
      0,
      "bullet",
    ) as unknown as FakeSprite;
    bullet.setData("expiresAt", harness.director.now + 2600);

    play(harness, 1000);
    harness.scene.now = WALL_CLOCK * 4;
    play(harness, 400);

    expect(bullet.destroyed).toBe(false);
  });

  test("is culled once it has flown its whole life", () => {
    const harness = setUp(1);
    const bullet = harness.director.bullets.create(
      0,
      0,
      "bullet",
    ) as unknown as FakeSprite;
    bullet.setData("expiresAt", harness.director.now + 2600);

    play(harness, 3000);

    expect(bullet.destroyed).toBe(true);
  });
});
