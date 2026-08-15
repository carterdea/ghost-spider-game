import { describe, expect, test } from "bun:test";
import type Phaser from "phaser";
import type { GameAudio } from "../../audio";
import type { SoundEvent } from "../../audio/events";
import { LEVELS } from "../../game/content/levels";
import {
  createInitialGameState,
  type EnemyState,
} from "../../game/simulation/state";
import { asScene, SceneDouble } from "../testing/sceneDouble";
import { RunFeedback } from "./feedback";

/** The slice of the hero a tilt and a flash write to. */
class HeroStub {
  public x = 400;
  public y = 300;
  public angle = 0;
  public active = true;
  public tint: number | null = null;

  public setAngle(value: number): this {
    this.angle = value;
    return this;
  }

  public setTintFill(color: number): this {
    this.tint = color;
    return this;
  }

  public clearTint(): this {
    this.tint = null;
    return this;
  }
}

interface Played {
  event: SoundEvent;
  intensity?: number;
}

class AudioStub {
  public readonly played: Played[] = [];

  public play(event: SoundEvent, intensity?: number): void {
    this.played.push({ event, intensity });
  }
}

const asHero = (hero: HeroStub): Phaser.Physics.Arcade.Sprite =>
  hero as unknown as Phaser.Physics.Arcade.Sprite;

const asAudio = (audio: AudioStub): GameAudio => audio as unknown as GameAudio;

interface Harness {
  scene: SceneDouble;
  hero: HeroStub;
  audio: AudioStub;
  feedback: RunFeedback;
}

const harness = (): Harness => {
  const scene = new SceneDouble();
  const hero = new HeroStub();
  const audio = new AudioStub();
  return {
    scene,
    hero,
    audio,
    feedback: new RunFeedback(asScene(scene), asHero(hero), asAudio(audio)),
  };
};

const enemy = (health: number): EnemyState => ({
  id: "robot-1",
  kind: "robot",
  health,
  damage: 8,
  speed: 120,
  invulnerable: false,
  patrolMinX: 0,
  patrolMaxX: 400,
});

const state = () => createInitialGameState(LEVELS[0]);

const intensitiesOf = (audio: AudioStub, event: SoundEvent): number[] =>
  audio.played
    .filter((entry) => entry.event === event)
    .map((entry) => entry.intensity ?? 0);

const FRAME_MS = 1000 / 60;

describe("landing", () => {
  test("a kerb-height arrival is not a landing", () => {
    const { audio, feedback, scene } = harness();

    feedback.land(200, false);

    expect(intensitiesOf(audio, "land")).toHaveLength(0);
    expect(scene.cameras.main.shakes).toHaveLength(0);
  });

  test("one arrival is one report, sized by what the floor swallowed", () => {
    const { audio, feedback, scene } = harness();

    feedback.land(450, true);

    expect(intensitiesOf(audio, "land")).toEqual([0.5]);
    expect(scene.cameras.main.shakes).toHaveLength(1);
  });

  test("the thump tops out rather than running away", () => {
    const { audio, feedback } = harness();

    feedback.land(4000, true);

    expect(intensitiesOf(audio, "land")).toEqual([1]);
  });

  test("touching down ends the chain", () => {
    const { feedback } = harness();
    const world = state();

    feedback.damage(world, enemy(10), 20, "melee", asHero(new HeroStub()), {
      x: 0,
      y: 0,
    });
    expect(feedback.combo.count).toBe(1);

    feedback.land(700, true);

    expect(feedback.combo.count).toBe(0);
    // The best of the run survives the chain that set it.
    expect(feedback.combo.best).toBe(1);
  });

  test("a graze in mid-air leaves the chain running", () => {
    const { feedback } = harness();
    const world = state();

    feedback.damage(world, enemy(10), 20, "melee", asHero(new HeroStub()), {
      x: 0,
      y: 0,
    });
    feedback.land(120, false);

    expect(feedback.combo.count).toBe(1);
  });

  test("standing on something ends the chain however softly it began", () => {
    const { audio, feedback } = harness();
    const world = state();

    feedback.damage(world, enemy(10), 20, "melee", asHero(new HeroStub()), {
      x: 0,
      y: 0,
    });
    // Every frame on foot arrives here with no impact to report. Left to the
    // impact alone, a hero could walk between street-level enemies and bank the
    // airborne multiplier and its healing forever.
    feedback.land(0, true);

    expect(feedback.combo.count).toBe(0);
    // Silently: there was no arrival worth a thump or a kick.
    expect(intensitiesOf(audio, "land")).toHaveLength(0);
  });
});

describe("a blow the hero lands", () => {
  test("a takedown walks the chain sound up the scale", () => {
    const { audio, feedback } = harness();
    const world = state();
    const victim = asHero(new HeroStub());

    feedback.damage(world, enemy(10), 20, "melee", victim, { x: 0, y: 0 });
    feedback.damage(world, enemy(10), 20, "melee", victim, { x: 0, y: 0 });

    expect(intensitiesOf(audio, "comboUp")).toEqual([1 / 7, 2 / 7]);
  });

  test("a blow that does not finish makes no chain sound", () => {
    const { audio, feedback } = harness();

    const defeated = feedback.damage(
      state(),
      enemy(100),
      20,
      "melee",
      asHero(new HeroStub()),
      { x: 0, y: 0 },
    );

    expect(defeated).toBe(false);
    expect(intensitiesOf(audio, "comboUp")).toHaveLength(0);
    expect(audio.played.map((entry) => entry.event)).toContain("enemyHit");
  });

  test("a deflected blow reports nothing landing", () => {
    const { audio, feedback, scene } = harness();
    const closed: EnemyState = { ...enemy(100), invulnerable: true };

    const defeated = feedback.damage(
      state(),
      closed,
      20,
      "melee",
      asHero(new HeroStub()),
      { x: 0, y: 0 },
    );

    expect(defeated).toBe(false);
    expect(closed.health).toBe(100);
    // The freeze is the sharp one: it is how the game rewards a blow that
    // connected, so handing it out for one that bounced lets a player slow
    // the boss down from outside the window they were meant to wait for.
    expect(scene.physics.world.isPaused).toBe(false);
    expect(scene.cameras.main.shakes).toHaveLength(0);
    expect(audio.played.map((entry) => entry.event)).not.toContain("enemyHit");
  });

  test("a fist lands heavier than a web shot", () => {
    const punch = harness();
    const shot = harness();
    const victim = asHero(new HeroStub());

    punch.feedback.damage(state(), enemy(100), 20, "melee", victim, {
      x: 0,
      y: 0,
    });
    shot.feedback.damage(state(), enemy(100), 20, "shot", victim, {
      x: 0,
      y: 0,
    });

    expect(punch.scene.cameras.main.shakes[0].amount).toBeGreaterThan(
      shot.scene.cameras.main.shakes[0].amount,
    );
  });

  test("a takedown lands heavier than a graze", () => {
    const kill = harness();
    const graze = harness();
    const victim = asHero(new HeroStub());

    kill.feedback.damage(state(), enemy(10), 20, "melee", victim, {
      x: 0,
      y: 0,
    });
    graze.feedback.damage(state(), enemy(100), 20, "melee", victim, {
      x: 0,
      y: 0,
    });

    expect(kill.scene.cameras.main.shakes[0].amount).toBeGreaterThan(
      graze.scene.cameras.main.shakes[0].amount,
    );
  });
});

describe("hit-stop", () => {
  test("holds the physics world, and only for as long as the blow", () => {
    const { feedback, scene } = harness();

    expect(scene.physics.world.isPaused).toBe(false);

    feedback.damage(state(), enemy(10), 20, "melee", asHero(new HeroStub()), {
      x: 0,
      y: 0,
    });
    feedback.step(FRAME_MS);
    expect(scene.physics.world.isPaused).toBe(true);

    // Past the longest freeze the module will ever ask for.
    scene.now = 500;
    feedback.step(FRAME_MS);
    expect(scene.physics.world.isPaused).toBe(false);
  });

  test("a frozen frame steps the simulation short, an ordinary one whole", () => {
    const { feedback, scene } = harness();

    expect(feedback.step(FRAME_MS)).toBe(FRAME_MS);

    feedback.damage(state(), enemy(10), 20, "melee", asHero(new HeroStub()), {
      x: 0,
      y: 0,
    });

    expect(feedback.step(FRAME_MS)).toBeLessThan(FRAME_MS);
    scene.now = 500;
    expect(feedback.step(FRAME_MS)).toBe(FRAME_MS);
  });

  test("a pause holds the world, and letting it go gives it straight back", () => {
    const { feedback, scene } = harness();

    feedback.step(FRAME_MS, true);
    expect(scene.physics.world.isPaused).toBe(true);

    feedback.step(FRAME_MS, false);
    expect(scene.physics.world.isPaused).toBe(false);
  });

  test("a pause lifted over a live freeze leaves the freeze holding", () => {
    const { feedback, scene } = harness();

    feedback.damage(state(), enemy(10), 20, "melee", asHero(new HeroStub()), {
      x: 0,
      y: 0,
    });
    feedback.step(FRAME_MS, true);
    expect(scene.physics.world.isPaused).toBe(true);

    // Resumed while the blow is still landing: the hit-stop is not over, so
    // the world must stay held rather than lurch back into motion.
    feedback.step(FRAME_MS, false);
    expect(scene.physics.world.isPaused).toBe(true);

    scene.now = 500;
    feedback.step(FRAME_MS, false);
    expect(scene.physics.world.isPaused).toBe(false);
  });

  test("a freeze that expires under a pause cannot release the world", () => {
    const { feedback, scene } = harness();

    feedback.damage(state(), enemy(10), 20, "melee", asHero(new HeroStub()), {
      x: 0,
      y: 0,
    });
    feedback.step(FRAME_MS, true);

    // The pause outlasts the hit-stop: neither is latched, so the run's own
    // status is the only thing left holding the world.
    scene.now = 500;
    feedback.step(FRAME_MS, true);
    expect(scene.physics.world.isPaused).toBe(true);

    feedback.step(FRAME_MS, false);
    expect(scene.physics.world.isPaused).toBe(false);
  });

  test("a freeze asked for after the frame's step still reaches Arcade first", () => {
    // Arcade steps the world before the scene updates, so a blow landed by the
    // scene itself — a fist, a gadget — misses the `step` that already ran this
    // frame. Left there, one more whole physics step and collision pass would
    // go through before the freeze was seen.
    const { feedback, scene } = harness();
    feedback.step(FRAME_MS);

    feedback.damage(state(), enemy(10), 20, "melee", asHero(new HeroStub()), {
      x: 0,
      y: 0,
    });
    expect(scene.physics.world.isPaused).toBe(false);

    feedback.holdWorld(false);

    expect(scene.physics.world.isPaused).toBe(true);
  });

  test("a run that ends inside the scene's update holds the world", () => {
    // `knockOut` drops the run's effects, which releases the world, and only
    // then poses the hero. Nothing may step in between.
    const { feedback, scene } = harness();
    feedback.step(FRAME_MS);
    feedback.reset();

    feedback.holdWorld(true);

    expect(scene.physics.world.isPaused).toBe(true);
  });

  test("a teardown mid-pause is put right by the next frame", () => {
    const { feedback, scene } = harness();

    feedback.step(FRAME_MS, true);
    feedback.reset();
    expect(scene.physics.world.isPaused).toBe(false);

    // The pause is the run's, not the effect layer's: the next frame derives
    // the world from it again rather than leaving it running underneath.
    feedback.step(FRAME_MS, true);
    expect(scene.physics.world.isPaused).toBe(true);
  });

  test("a teardown mid-freeze releases the world", () => {
    const { feedback, scene } = harness();

    feedback.damage(state(), enemy(10), 20, "melee", asHero(new HeroStub()), {
      x: 0,
      y: 0,
    });
    feedback.step(FRAME_MS);
    expect(scene.physics.world.isPaused).toBe(true);

    feedback.reset();

    expect(scene.physics.world.isPaused).toBe(false);
  });
});

describe("the hero", () => {
  test("leans into the direction of travel, and stands up on reset", () => {
    const { feedback, hero } = harness();

    for (let frame = 0; frame < 30; frame += 1) {
      feedback.lean("swinging", 900, FRAME_MS);
    }
    expect(hero.angle).toBeGreaterThan(0);

    feedback.reset();

    expect(hero.angle).toBe(0);
  });

  test("a hit flashes them, and a teardown never leaves the flash on", () => {
    const { feedback, hero } = harness();

    feedback.hurt();
    expect(hero.tint).not.toBeNull();

    // A knock-out resets mid-flash and then poses the hero: an expiring flash
    // must not be left to clear the pose's own tint a frame later.
    feedback.reset();

    expect(hero.tint).toBeNull();
  });

  test("a hit kicks the camera without freezing the world", () => {
    const { feedback, scene } = harness();

    feedback.hurt();
    feedback.step(FRAME_MS);

    expect(scene.cameras.main.shakes).toHaveLength(1);
    expect(scene.physics.world.isPaused).toBe(false);
  });
});

describe("a paused run and the level's tweens", () => {
  test("a pause holds the tweens that drive the moving platforms", () => {
    // Platform decks are tween-driven and carry whatever stands on them, and
    // tweens do not stop with the physics world: a pause taken on a rising
    // hoist would otherwise keep hauling the hero up the district.
    const { feedback, scene } = harness();
    expect(scene.tweensPaused).toBe(false);

    feedback.step(FRAME_MS, true);
    expect(scene.tweensPaused).toBe(true);

    feedback.step(FRAME_MS, false);
    expect(scene.tweensPaused).toBe(false);
  });

  test("a hit-stop leaves them running", () => {
    // A freeze is tens of milliseconds; holding the manager mid-blow would
    // stall the very tweens the blow just started.
    const { feedback, scene } = harness();

    feedback.damage(state(), enemy(10), 20, "melee", asHero(new HeroStub()), {
      x: 0,
      y: 0,
    });
    feedback.step(FRAME_MS);

    expect(scene.physics.world.isPaused).toBe(true);
    expect(scene.tweensPaused).toBe(false);
  });

  test("teardown releases them", () => {
    const { feedback, scene } = harness();
    feedback.step(FRAME_MS, true);
    expect(scene.tweensPaused).toBe(true);

    feedback.reset();
    expect(scene.tweensPaused).toBe(false);
  });
});
