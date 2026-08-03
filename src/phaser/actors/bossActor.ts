import type Phaser from "phaser";
import { artKeys, colors } from "../../game/assets/manifest";
import {
  BOSS_TUNING,
  type BossIntent,
  type BossMemory,
  type BossPerception,
  createBossMemory,
} from "../../game/simulation/ai";
import {
  clamp,
  type Rect,
  rectBottom,
  rectLeft,
  rectRight,
  rectTop,
} from "../../game/simulation/physics/vector";
import type { BossSpawn, EnemyState } from "../../game/simulation/state";
import { drawBossOverlay } from "./bossOverlay";
import { applyBodyBox, BODY_BOXES } from "./placement";
import { telegraphTint } from "./telegraph";

/** The boss's own timers and framing. Present on exactly one enemy view. */
export interface BossRuntime {
  /** The pure boss brain's timers. Owned by the director, handed back each frame. */
  memory: BossMemory;
  arena: Rect;
  /** Health it spawned with, so the brain can reason in fractions. */
  maxHealth: number;
  /** Authored contact damage. Zeroed on the view while the boss is open. */
  contactDamage: number;
  /** Last intent the brain reached — the punish window, phase and tell. */
  intent: BossIntent;
}

/** The drone silhouette, blown up until it reads as a boss. */
const BOSS_SCALE = 1.7;
/**
 * The drone art sits low in its 192px frame. Pulling the origin down onto the
 * hull puts the sprite's own x/y at the middle of the craft, so its rings,
 * bullets and health bar all line up with the thing the player can see.
 */
const BOSS_ORIGIN_Y = 0.83;

export const createBossSprite = (
  scene: Phaser.Scene,
  spawn: BossSpawn,
): Phaser.Physics.Arcade.Sprite => {
  const sprite = scene.physics.add.sprite(
    clamp(spawn.position.x, rectLeft(spawn.arena), rectRight(spawn.arena)),
    clamp(spawn.position.y, rectTop(spawn.arena), rectBottom(spawn.arena)),
    artKeys.drone[0],
  );
  sprite.setScale(BOSS_SCALE);
  sprite.setOrigin(0.5, BOSS_ORIGIN_Y);
  sprite.setCollideWorldBounds(true);
  sprite.setDepth(4);
  applyBodyBox(sprite, BODY_BOXES.drone);
  sprite.body?.setAllowGravity(false);
  sprite.play("drone-fly");
  return sprite;
};

export const createBossRuntime = (spawn: BossSpawn): BossRuntime => ({
  memory: createBossMemory(-1),
  arena: { ...spawn.arena },
  maxHealth: Math.max(1, spawn.health),
  contactDamage: spawn.damage,
  intent: dormantIntent(),
});

export const perceiveBoss = (
  sprite: Phaser.Physics.Arcade.Sprite,
  boss: BossRuntime,
  state: EnemyState,
  player: Phaser.Physics.Arcade.Sprite,
  blockers: readonly Rect[],
  snared: boolean,
): BossPerception => {
  const velocity = player.body?.velocity;
  return {
    position: { x: sprite.x, y: sprite.y },
    player: {
      position: { x: player.x, y: player.y },
      velocity: { x: velocity?.x ?? 0, y: velocity?.y ?? 0 },
    },
    arena: boss.arena,
    speed: state.speed,
    healthFraction: clamp(state.health / boss.maxHealth, 0, 1),
    blockers,
    snared,
  };
};

/** Moves and paints the hull. Bullets and sound stay with the director. */
export const applyBossIntent = (
  sprite: Phaser.Physics.Arcade.Sprite,
  intent: BossIntent,
): void => {
  sprite.setVelocity(intent.velocityX, intent.velocityY);
  sprite.setFlipX(intent.facing < 0);
  paint(sprite, intent);
};

/** Contact only hurts while the boss is closed: the punish window must be safe. */
export const bossContactDamage = (boss: BossRuntime): number =>
  boss.intent.vulnerable ? 0 : boss.contactDamage;

export const drawBoss = (
  overlay: Phaser.GameObjects.Graphics,
  sprite: Phaser.Physics.Arcade.Sprite,
  boss: BossRuntime,
  state: EnemyState,
  player: Phaser.Physics.Arcade.Sprite,
): void => {
  drawBossOverlay(
    overlay,
    {
      position: { x: sprite.x, y: sprite.y },
      // Sized off the hull rather than the sprite frame, which is mostly
      // transparent padding.
      radius: (sprite.body?.width ?? sprite.displayWidth) * 0.5,
      halfHeight: (sprite.body?.height ?? sprite.displayHeight) * 0.5,
      player: { x: player.x, y: player.y },
      intent: boss.intent,
      phase: BOSS_TUNING.phases[boss.intent.phase],
      healthFraction: state.health / boss.maxHealth,
      thresholds: BOSS_TUNING.phaseThresholds,
      clock: boss.memory.clock,
    },
    BOSS_TUNING.novaShots,
  );
};

/**
 * The boss reads its own state off its tint alone: teal while the punish
 * window is open, heating towards pink as a strike winds up.
 */
const paint = (
  sprite: Phaser.Physics.Arcade.Sprite,
  intent: BossIntent,
): void => {
  if (intent.vulnerable) {
    sprite.setTint(colors.balletTeal);
    return;
  }
  if (intent.telegraph > 0) {
    sprite.setTint(telegraphTint(intent.telegraph));
    return;
  }
  sprite.clearTint();
};

/** Nothing has happened yet: what a freshly spawned boss last "decided". */
const dormantIntent = (): BossIntent => ({
  velocityX: 0,
  velocityY: 0,
  facing: -1,
  state: "dormant",
  phase: 1,
  telegraph: 0,
  telegraphKind: null,
  vulnerable: false,
  attack: null,
  event: null,
});
