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

    feedback.land(200);

    expect(intensitiesOf(audio, "land")).toHaveLength(0);
    expect(scene.cameras.main.shakes).toHaveLength(0);
  });

  test("one arrival is one report, sized by what the floor swallowed", () => {
    const { audio, feedback, scene } = harness();

    feedback.land(450);

    expect(intensitiesOf(audio, "land")).toEqual([0.5]);
    expect(scene.cameras.main.shakes).toHaveLength(1);
  });

  test("the thump tops out rather than running away", () => {
    const { audio, feedback } = harness();

    feedback.land(4000);

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

    feedback.land(700);

    expect(feedback.combo.count).toBe(0);
    // The best of the run survives the chain that set it.
    expect(feedback.combo.best).toBe(1);
  });

  test("a kerb-height arrival leaves the chain running", () => {
    const { feedback } = harness();
    const world = state();

    feedback.damage(world, enemy(10), 20, "melee", asHero(new HeroStub()), {
      x: 0,
      y: 0,
    });
    feedback.land(120);

    expect(feedback.combo.count).toBe(1);
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
