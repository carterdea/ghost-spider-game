import { beforeEach, describe, expect, test } from "bun:test";
import type Phaser from "phaser";
import { LEVELS } from "../../game/content/levels";
import {
  createInitialGameState,
  type EnemyState,
  type GameState,
} from "../../game/simulation/state";
import type { EnemyDirector, EnemyView } from "../actors/EnemyDirector";
import type { FakeCollider } from "../testing/sceneDouble";
import { asScene, SceneDouble } from "../testing/sceneDouble";
import { LevelWorld } from "../world/LevelWorld";
import { registerCombat } from "./combatColliders";
import type { RunFeedback } from "./feedback";

/**
 * These tests exist because two shipped bugs lived in this wiring and the suite
 * could not see either of them: enemy bullets crossed buildings, and a
 * zero-damage touch burned the shared hit cooldown. Both are collision
 * sequencing, which no amount of testing the pure layer would have caught.
 *
 * Nothing here simulates physics. The double records what was wired to what;
 * a test asserts the intersection itself and fires the handler.
 */

/** Stands in for anything Arcade would hand a handler: it only needs a place. */
class Body {
  public destroyCount = 0;
  public active = true;

  public constructor(
    public x = 0,
    public y = 0,
    private readonly data: Record<string, unknown> = {},
  ) {}

  public getData(key: string): unknown {
    return this.data[key];
  }

  public destroy(): void {
    this.destroyCount += 1;
    this.active = false;
  }
}

const asSprite = (body: Body): Phaser.Physics.Arcade.Sprite =>
  body as unknown as Phaser.Physics.Arcade.Sprite;

const enemyState = (overrides: Partial<EnemyState> = {}): EnemyState => ({
  id: "e1",
  kind: "robot",
  health: 40,
  damage: 0,
  speed: 90,
  patrolMinX: 0,
  patrolMaxX: 200,
  ...overrides,
});

interface Enemy {
  view: EnemyView;
  body: Body;
}

const enemyAt = (x: number, state: EnemyState): Enemy => {
  const body = new Body(x, 0);
  return {
    body,
    view: {
      state,
      sprite: asSprite(body),
      snaredUntil: 0,
    } as unknown as EnemyView,
  };
};

/** What the director exposes to the wiring, and nothing else. */
const directorOf = (
  enemies: Enemy[],
  bullets: object,
): { director: EnemyDirector; snared: EnemyView[]; defeated: EnemyView[] } => {
  const snared: EnemyView[] = [];
  const defeated: EnemyView[] = [];
  return {
    snared,
    defeated,
    director: {
      bullets,
      all: enemies.map((enemy) => enemy.view),
      snare: (view: EnemyView) => snared.push(view),
      defeat: (view: EnemyView) => defeated.push(view),
    } as unknown as EnemyDirector,
  };
};

interface Harness {
  scene: SceneDouble;
  state: GameState;
  world: LevelWorld;
  player: Body;
  bullets: object;
  projectiles: object;
  enemies: Enemy[];
  snared: EnemyView[];
  defeated: EnemyView[];
  hurts: number;
  playing: boolean;
}

const setUp = (enemyStates: EnemyState[]): Harness => {
  const scene = new SceneDouble();
  const state = createInitialGameState(LEVELS[0], "playing");
  const world = new LevelWorld(asScene(scene));
  const player = new Body(100, 100);
  const bullets = { kind: "bullets" };
  const projectiles = { kind: "projectiles" };
  const enemies = enemyStates.map((each, index) =>
    enemyAt(200 + index * 50, each),
  );
  const { director, snared, defeated } = directorOf(enemies, bullets);

  const harness: Harness = {
    scene,
    state,
    world,
    player,
    bullets,
    projectiles,
    enemies,
    snared,
    defeated,
    hurts: 0,
    playing: true,
  };

  registerCombat({
    scene: asScene(scene),
    state,
    player: asSprite(player),
    enemies: director,
    world,
    projectiles: projectiles as unknown as Phaser.Physics.Arcade.Group,
    feedback: {
      hurt: () => {
        harness.hurts += 1;
      },
      damage: () => false,
    } as unknown as RunFeedback,
    isPlaying: () => harness.playing,
  });

  return harness;
};

/** The one registration wired between a pair; fails loudly if it is missing. */
const collisionBetween = (
  scene: SceneDouble,
  objectA: unknown,
  objectB: unknown,
): FakeCollider => {
  const found = scene.collisionsBetween(objectA, objectB);
  expect(found).toHaveLength(1);
  return found[0];
};

describe("enemy bullets", () => {
  test("stop at a building instead of crossing it", () => {
    const harness = setUp([]);
    const collision = collisionBetween(
      harness.scene,
      harness.bullets,
      harness.world.platforms,
    );
    const bullet = new Body(0, 0);

    collision.fire(bullet);

    // Targeting treats buildings as sight blockers. A shot that passes through
    // one makes breaking line of sight worthless.
    expect(bullet.destroyCount).toBe(1);
    expect(collision.kind).toBe("collider");
  });

  test("are caught by the web shield without costing health", () => {
    const harness = setUp([]);
    harness.state.player.shieldUntil = 500;
    harness.scene.now = 200;
    const collision = collisionBetween(
      harness.scene,
      harness.player,
      harness.bullets,
    );
    const bullet = new Body(0, 0);

    collision.fire(harness.player, bullet);

    expect(bullet.destroyCount).toBe(1);
    expect(harness.state.player.health).toBe(100);
    expect(harness.hurts).toBe(0);
  });

  test("hurt once the shield has expired", () => {
    const harness = setUp([]);
    harness.state.player.shieldUntil = 500;
    harness.scene.now = 600;
    const collision = collisionBetween(
      harness.scene,
      harness.player,
      harness.bullets,
    );

    collision.fire(harness.player, new Body(0, 0));

    expect(harness.state.player.health).toBe(88);
    expect(harness.hurts).toBe(1);
  });
});

describe("contact damage", () => {
  let harness: Harness;
  let patrol: Enemy;
  let striker: Enemy;

  beforeEach(() => {
    harness = setUp([
      // The brain zeroes contact damage outside a committed strike, so this is
      // what an uncommitted patrol looks like by the time it reaches the
      // overlap: present, solid, harmless.
      enemyState({ id: "patrol", damage: 0 }),
      enemyState({ id: "striker", damage: 18 }),
    ]);
    [patrol, striker] = harness.enemies;
  });

  const touch = (enemy: Enemy): void => {
    collisionBetween(harness.scene, harness.player, enemy.body).fire();
  };

  test("a committed strike hurts on contact", () => {
    touch(striker);

    expect(harness.state.player.health).toBe(82);
    expect(harness.state.player.message).toBe("Robot tackle.");
    expect(harness.hurts).toBe(1);
  });

  test("brushing an uncommitted patrol does nothing at all", () => {
    touch(patrol);

    expect(harness.state.player.health).toBe(100);
    expect(harness.hurts).toBe(0);
    // No hit happened, so nothing should have been announced either.
    expect(harness.state.player.message).not.toBe("Robot tackle.");
  });

  test("a harmless touch does not spend the cooldown a real strike needs", () => {
    touch(patrol);
    // Same frame, second enemy: the cooldown is one field shared by every
    // enemy, so a patrol that banked it would swallow this lunge outright.
    touch(striker);

    expect(harness.state.player.health).toBe(82);
    expect(harness.hurts).toBe(1);
  });

  test("a landed strike does hold the cooldown against the next one", () => {
    touch(striker);
    touch(striker);

    // One hit, not two: the second touch lands inside the 700ms window.
    expect(harness.state.player.health).toBe(82);

    harness.scene.now = 700;
    touch(striker);

    expect(harness.state.player.health).toBe(64);
  });

  test("a snared enemy cannot hurt the player it is pinned against", () => {
    striker.view.snaredUntil = 400;
    harness.scene.now = 100;

    touch(striker);

    expect(harness.state.player.health).toBe(100);
  });

  test("nothing lands once the run is over", () => {
    harness.playing = false;

    touch(striker);

    expect(harness.state.player.health).toBe(100);
  });
});

describe("web shots", () => {
  test("a net snares its target and pays net damage", () => {
    const harness = setUp([enemyState({ damage: 0 })]);
    const [enemy] = harness.enemies;
    const collision = collisionBetween(
      harness.scene,
      enemy.body,
      harness.projectiles,
    );
    const net = new Body(210, 4, { power: "net" });

    collision.fire(enemy.body, net);

    expect(net.destroyCount).toBe(1);
    expect(harness.snared).toEqual([enemy.view]);
  });

  test("a spent projectile is ignored rather than counted twice", () => {
    const harness = setUp([enemyState({ damage: 0 })]);
    const [enemy] = harness.enemies;
    const collision = collisionBetween(
      harness.scene,
      enemy.body,
      harness.projectiles,
    );
    const net = new Body(210, 4, { power: "net" });
    net.destroy();

    collision.fire(enemy.body, net);

    expect(harness.snared).toHaveLength(0);
  });
});

describe("level teardown", () => {
  test("every collision registered is handed to the world to destroy", () => {
    const harness = setUp([enemyState(), enemyState()]);

    // Two per enemy plus the two world-wide ones. If a registration escapes
    // this list it outlives its level and fires against a torn-down world.
    expect(harness.scene.colliderLog).toHaveLength(6);

    harness.world.destroy();

    expect(harness.scene.liveColliders()).toHaveLength(0);
  });
});
