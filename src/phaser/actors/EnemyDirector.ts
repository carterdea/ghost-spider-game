import Phaser from "phaser";
import { artKeys, colors } from "../../game/assets/manifest";
import type {
  EnemyLane,
  EnemySpawn,
  LevelDefinition,
} from "../../game/content/levels";
import {
  AI_TUNING,
  type AiIntent,
  type AiMemory,
  type AiPerception,
  BOSS_TUNING,
  type BossAttack,
  type BossEvent,
  createAiMemory,
  type EnemyAiState,
  stepBossBrain,
  stepEnemyBrain,
} from "../../game/simulation/ai";
import {
  clamp,
  type Rect,
  type Vec2,
} from "../../game/simulation/physics/vector";
import {
  type BossSpawn,
  createBossState,
  type EnemyKind,
  type EnemyState,
  type GameState,
} from "../../game/simulation/state";
import {
  applyBossIntent,
  type BossRuntime,
  bossContactDamage,
  createBossRuntime,
  createBossSprite,
  drawBoss,
  perceiveBoss,
} from "./bossActor";
import { applyBodyBox, BODY_BOXES, standOn } from "./placement";
import { telegraphTint } from "./telegraph";

export interface EnemyView {
  state: EnemyState;
  sprite: Phaser.Physics.Arcade.Sprite;
  lane: EnemyLane;
  /** Which way the sprite currently faces. */
  direction: -1 | 1;
  /** The pure brain's timers. Owned here, handed back every frame. */
  brain: AiMemory;
  /** Last decision the brain reached — handy for HUD and debugging. */
  aiState: EnemyAiState;
  snaredUntil: number;
  /** Y the drone bobs around; air enemies ignore gravity. */
  hoverY: number;
  /** Set only on the finale boss, which runs a different brain entirely. */
  boss?: BossRuntime;
}

const SNARE_DURATION = 1800;
/** A netted boss goes limp far more briefly; the brain then shrugs nets off. */
const BOSS_SNARE_DURATION = 420;
const BULLET_LIFETIME = 2600;
/** A frame this long or longer is a stall; the AI must not teleport through it. */
const MAX_STEP = 0.05;
/** Bullets leave from here rather than the sprite centre. */
const MUZZLE_OFFSET = 26;
/** The boss's hull is wide, so its shots start well clear of it. */
const BOSS_MUZZLE_OFFSET = 96;

/** Owns every enemy sprite and their bullets for the level currently loaded. */
export class EnemyDirector {
  private readonly scene: Phaser.Scene;
  private views: EnemyView[] = [];
  private bulletGroup?: Phaser.Physics.Arcade.Group;
  private telegraph?: Phaser.GameObjects.Graphics;
  private colliders: Phaser.Physics.Arcade.Collider[] = [];
  private blockers: readonly Rect[] = [];
  private lastTime = 0;
  private readonly onShot?: () => void;
  private readonly onBossEvent?: (event: BossEvent) => void;

  /**
   * `onShot` fires once per bullet and `onBossEvent` once per boss beat, both
   * for the presentation layer's sound and camera.
   */
  public constructor(
    scene: Phaser.Scene,
    onShot?: () => void,
    onBossEvent?: (event: BossEvent) => void,
  ) {
    this.scene = scene;
    this.onShot = onShot;
    this.onBossEvent = onBossEvent;
  }

  public get bullets(): Phaser.Physics.Arcade.Group {
    if (!this.bulletGroup) {
      this.bulletGroup = this.scene.physics.add.group({ allowGravity: false });
    }
    return this.bulletGroup;
  }

  public get all(): readonly EnemyView[] {
    return this.views;
  }

  public spawn(
    level: LevelDefinition,
    state: GameState,
    platforms: Phaser.Physics.Arcade.StaticGroup,
  ): void {
    this.clear();
    this.blockers = level.buildings.map((building) => building.bounds);

    for (const spawn of level.enemies) {
      const enemyState = state.enemies.find((entry) => entry.id === spawn.id);
      if (!enemyState) {
        continue;
      }
      if (enemyState.kind !== spawn.kind) {
        throw new Error(
          `Enemy "${spawn.id}" is authored as ${spawn.kind} but its state says ${enemyState.kind}.`,
        );
      }
      this.views.push(this.createView(spawn, enemyState, platforms));
    }
  }

  private createView(
    spawn: EnemySpawn,
    state: EnemyState,
    platforms: Phaser.Physics.Arcade.StaticGroup,
  ): EnemyView {
    const sprite = this.scene.physics.add.sprite(
      spawn.position.x,
      spawn.position.y,
      textureFor(spawn.kind),
    );
    sprite.setScale(spawn.kind === "gunner" ? 0.65 : 0.58);
    sprite.setCollideWorldBounds(true);
    sprite.setDepth(3);
    applyBodyBox(sprite, BODY_BOXES[spawn.kind]);
    sprite.play(animationFor(spawn.kind));

    const airborne = spawn.lane === "air";
    sprite.body?.setAllowGravity(!airborne);
    if (airborne) {
      sprite.setPosition(spawn.position.x, spawn.position.y);
    } else {
      standOn(sprite, spawn.position.x, spawn.position.y);
      this.colliders.push(this.scene.physics.add.collider(sprite, platforms));
    }

    return {
      state,
      sprite,
      lane: spawn.lane,
      direction: 1,
      // A per-enemy phase offset keeps bobbing and strafing out of lockstep.
      brain: createAiMemory(1, spawn.position.x * 0.01),
      aiState: "patrol",
      snaredUntil: 0,
      hoverY: spawn.position.y,
    };
  }

  /**
   * Drops the finale boss into the arena. Called after `spawn()`, which clears
   * everything: level data authors patrols only, so the boss is the scene's to
   * place. Its state joins `state.enemies`, so the existing combat overlaps,
   * scoring and threat count all treat it like any other enemy.
   */
  public spawnBoss(spawn: BossSpawn, state: GameState): EnemyView {
    const enemyState = createBossState(spawn);
    state.enemies = [
      ...state.enemies.filter((entry) => entry.id !== spawn.id),
      enemyState,
    ];

    const sprite = createBossSprite(this.scene, spawn);
    const view: EnemyView = {
      state: enemyState,
      sprite,
      lane: "air",
      direction: -1,
      brain: createAiMemory(-1),
      aiState: "patrol",
      snaredUntil: 0,
      hoverY: sprite.y,
      boss: createBossRuntime(spawn),
    };
    this.views.push(view);
    return view;
  }

  /** The boss, while it is alive. */
  public get boss(): EnemyView | undefined {
    return this.views.find((view) => view.boss && view.sprite.active);
  }

  public update(time: number, player: Phaser.Physics.Arcade.Sprite): void {
    const dt = clamp((time - this.lastTime) / 1000, 0, MAX_STEP);
    this.lastTime = time;

    const overlay = this.requireTelegraph();
    overlay.clear();
    this.cullBullets(time);

    for (const view of this.views) {
      if (!view.sprite.active) {
        continue;
      }
      if (view.boss) {
        this.updateBoss(view, view.boss, player, dt, time, overlay);
        continue;
      }
      this.updatePatrol(view, player, dt, time, overlay);
    }
  }

  private updatePatrol(
    view: EnemyView,
    player: Phaser.Physics.Arcade.Sprite,
    dt: number,
    time: number,
    overlay: Phaser.GameObjects.Graphics,
  ): void {
    const kind = patrolKind(view);
    if (!kind) {
      return;
    }

    const step = stepEnemyBrain(
      kind,
      view.brain,
      this.perceive(view, player, time),
      AI_TUNING[kind],
      dt,
    );
    view.brain = step.memory;
    view.aiState = step.intent.state;
    this.applyIntent(view, step.intent, time);
    this.drawTelegraph(overlay, view, step.intent, player);
  }

  private updateBoss(
    view: EnemyView,
    boss: BossRuntime,
    player: Phaser.Physics.Arcade.Sprite,
    dt: number,
    time: number,
    overlay: Phaser.GameObjects.Graphics,
  ): void {
    const step = stepBossBrain(
      boss.memory,
      perceiveBoss(
        view.sprite,
        boss,
        view.state,
        player,
        this.blockers,
        time < view.snaredUntil,
      ),
      BOSS_TUNING,
      dt,
    );
    boss.memory = step.memory;
    boss.intent = step.intent;

    view.direction = step.intent.facing;
    applyBossIntent(view.sprite, step.intent);
    // Combat reads `state.damage` at the moment of the hit, so the open window
    // becomes safe to dive into without any change to the caller.
    view.state.damage = bossContactDamage(boss);

    if (step.intent.attack) {
      this.launchBossAttack(step.intent.attack);
    }
    if (step.intent.event) {
      this.onBossEvent?.(step.intent.event);
    }

    drawBoss(overlay, view.sprite, boss, view.state, player);
  }

  /** A slam is carried by the body; only the shooting attacks make bullets. */
  private launchBossAttack(attack: BossAttack): void {
    if (attack.kind === "slam") {
      return;
    }
    const nova = attack.kind === "nova";
    for (const shot of attack.shots) {
      this.fire(shot.origin, shot.velocity, {
        scale: nova ? 1.6 : 2,
        tint: nova ? colors.wingLavender : colors.danger,
        muzzle: BOSS_MUZZLE_OFFSET,
      });
    }
  }

  private perceive(
    view: EnemyView,
    player: Phaser.Physics.Arcade.Sprite,
    time: number,
  ): AiPerception {
    const velocity = player.body?.velocity;
    return {
      position: { x: view.sprite.x, y: view.sprite.y },
      player: {
        position: { x: player.x, y: player.y },
        velocity: { x: velocity?.x ?? 0, y: velocity?.y ?? 0 },
      },
      patrol: { minX: view.state.patrolMinX, maxX: view.state.patrolMaxX },
      speed: view.state.speed,
      airborne: view.lane === "air",
      homeY: view.hoverY,
      blockers: this.blockers,
      snared: time < view.snaredUntil,
    };
  }

  private applyIntent(view: EnemyView, intent: AiIntent, time: number): void {
    const { sprite } = view;
    sprite.setVelocityX(intent.velocityX);
    if (intent.velocityY !== null) {
      sprite.setVelocityY(intent.velocityY);
    }

    view.direction = intent.facing;
    sprite.setFlipX(intent.facing < 0);
    this.paint(view, intent.telegraph, time);

    if (intent.attack?.kind === "shot") {
      this.fire(intent.attack.origin, intent.attack.velocity);
    }
  }

  /** One place decides the sprite's tint, so a snare and a wind-up cannot fight. */
  private paint(view: EnemyView, telegraph: number, time: number): void {
    if (time < view.snaredUntil) {
      view.sprite.setTint(colors.web);
      return;
    }
    if (telegraph > 0) {
      view.sprite.setTint(telegraphTint(telegraph));
      return;
    }
    view.sprite.clearTint();
  }

  private drawTelegraph(
    overlay: Phaser.GameObjects.Graphics,
    view: EnemyView,
    intent: AiIntent,
    player: Phaser.Physics.Arcade.Sprite,
  ): void {
    const { x, y } = view.sprite;

    if (intent.state === "alert") {
      // An exclamation mark riding clear of the sprite, whatever its height.
      const top = y - view.sprite.displayHeight * 0.5 - 30;
      overlay.lineStyle(5, colors.balletTeal, 0.95);
      overlay.lineBetween(x, top, x, top + 18);
      overlay.lineBetween(x, top + 25, x, top + 27);
      return;
    }

    if (intent.telegraph <= 0) {
      return;
    }

    const amount = clamp(intent.telegraph, 0, 1);
    overlay.lineStyle(2, colors.danger, 0.3 + 0.6 * amount);

    if (view.state.kind === "gunner") {
      // A charging sight-line that reaches the hero exactly as the shot leaves.
      overlay.lineBetween(
        x,
        y,
        x + (player.x - x) * amount,
        y + (player.y - y) * amount,
      );
      return;
    }

    overlay.strokeCircle(x, y, Phaser.Math.Linear(78, 22, amount));
  }

  private fire(origin: Vec2, velocity: Vec2, style: BulletStyle = {}): void {
    const heading = Math.atan2(velocity.y, velocity.x);
    const muzzle = style.muzzle ?? MUZZLE_OFFSET;
    const bullet = this.bullets.create(
      origin.x + Math.cos(heading) * muzzle,
      origin.y + Math.sin(heading) * muzzle,
      "bullet",
    ) as Phaser.Physics.Arcade.Sprite;

    bullet.setVelocity(velocity.x, velocity.y);
    bullet.setScale(style.scale ?? 1);
    bullet.setTint(style.tint ?? colors.danger);
    bullet.setDepth(4);
    bullet.setData("expiresAt", this.scene.time.now + BULLET_LIFETIME);
    this.onShot?.();
  }

  /** Bullets expire on a stamp rather than a timer, so nothing outlives `clear()`. */
  private cullBullets(time: number): void {
    if (!this.bulletGroup) {
      return;
    }
    for (const child of [...this.bulletGroup.getChildren()]) {
      const bullet = child as Phaser.Physics.Arcade.Sprite;
      const expiresAt = bullet.getData("expiresAt") as number | undefined;
      if (bullet.active && expiresAt !== undefined && time >= expiresAt) {
        bullet.destroy();
      }
    }
  }

  private requireTelegraph(): Phaser.GameObjects.Graphics {
    if (!this.telegraph) {
      this.telegraph = this.scene.add.graphics().setDepth(7);
    }
    return this.telegraph;
  }

  public snare(view: EnemyView): void {
    view.snaredUntil =
      this.scene.time.now + (view.boss ? BOSS_SNARE_DURATION : SNARE_DURATION);
    view.sprite.setVelocity(0, 0);
    view.sprite.setTint(colors.web);
  }

  public defeat(view: EnemyView): void {
    if (view.boss) {
      this.onBossEvent?.("defeated");
    }
    view.sprite.destroy();
  }

  public clear(): void {
    for (const collider of this.colliders) {
      collider.destroy();
    }
    this.colliders = [];

    for (const view of this.views) {
      view.sprite.destroy();
    }
    this.views = [];

    this.blockers = [];
    this.lastTime = 0;
    this.telegraph?.clear();
    this.liveBullets?.clear(true, true);
  }

  /** Full teardown for scene shutdown: nothing survives to the next boot. */
  public destroy(): void {
    this.clear();
    this.liveBullets?.destroy(true);
    this.bulletGroup = undefined;
    this.telegraph?.destroy();
    this.telegraph = undefined;
  }

  /**
   * The bullet group, unless Phaser has already taken it. Arcade Physics tears
   * its groups down on scene shutdown before any listener registered by the
   * scene runs, and a destroyed group drops its child list: touching one from
   * our own teardown throws and abandons the rest of the restart.
   */
  private get liveBullets(): Phaser.Physics.Arcade.Group | undefined {
    return this.bulletGroup?.scene ? this.bulletGroup : undefined;
  }
}

/** Bullets differ by who fired them, so a boss volley never reads as chaff. */
interface BulletStyle {
  scale?: number;
  tint?: number;
  muzzle?: number;
}

/** The authored kind, or `null` for the boss — which runs its own brain. */
const patrolKind = (view: EnemyView): EnemyKind | null =>
  view.state.kind === "boss" ? null : view.state.kind;

const textureFor = (kind: EnemyKind): string => {
  if (kind === "gunner") {
    return artKeys.enforcer[0];
  }
  return kind === "drone" ? artKeys.drone[0] : artKeys.robot[0];
};

const animationFor = (kind: EnemyKind): string => {
  if (kind === "gunner") {
    return "gunner-walk";
  }
  return kind === "drone" ? "drone-fly" : "robot-walk";
};
