import type Phaser from "phaser";
import type { Vec2 } from "../../game/simulation/physics/vector";
import {
  fuseEndsAt,
  fuseProgress,
  throwVelocity,
  WEB_BOMB,
} from "../../game/simulation/systems/weapons";
import type { LevelWorld } from "../world/LevelWorld";
import { WEAPON_TEXTURES } from "../world/textures";
import { fitWidth } from "./placement";
import { telegraphTint } from "./telegraph";

/**
 * Every web bomb in the air or on a wall. It owns the charges, their flight,
 * the fuse they telegraph and the mesh they leave; the rack above it decides
 * what a burst catches.
 *
 * The lifetime rules are the ones this codebase keeps getting wrong: the group
 * belongs to the class and is destroyed with it, while every timer, tween and
 * collider belongs to the level currently loaded and goes with it.
 */

/** When the fuse burns, and when it goes off. `undefined` means still flying. */
/** Defined in `actors/animations.ts`, alongside the character cycles. */
const ARMED_ANIMATION = "web-bomb-armed";

const BURST_AT = "burstAt";
/** The scale the armed charge pulses around, whatever its texture measures. */
const ARMED_SCALE = "armedScale";

/** Depth: above the hero (8), below the web lines (20). */
const BOMB_DEPTH = 9;
const MESH_DEPTH = 7;

/**
 * On-screen widths, in pixels. The texture's own size never leaks out, so a
 * raster frame drops in at the same size the placeholder drew at.
 *
 * The armed charge is the wider of the two on purpose: its anchor strands splay
 * to the edge of the frame, which leaves the lit core reading at well under
 * half the stated width.
 */
const FLYING_WIDTH = 28;
const ARMED_WIDTH = 50;

/** How much the armed charge swells across its fuse. */
const ARMED_SWELL = 0.4;
/** Wobble on top of the swell, so the last beat of the fuse reads as urgent. */
const ARMED_PULSE = 0.14;
const PULSE_CYCLES = 26;

export interface BombHooks {
  /**
   * The run clock. Fuses are stamped against it rather than wall time: a fuse
   * on wall time keeps burning through a pause it cannot be seen to burn
   * through, so every charge held when the game stopped would detonate
   * together on the frame it started again.
   */
  readonly now: () => number;
  /** A charge has anchored itself and started its fuse. */
  readonly onStick: () => void;
  /** A charge has gone off at this point. */
  readonly onBurst: (centre: Vec2) => void;
}

export class WebBombs {
  private readonly scene: Phaser.Scene;
  private readonly hooks: BombHooks;
  private charges?: Phaser.Physics.Arcade.Group;
  private world?: LevelWorld;

  public constructor(scene: Phaser.Scene, hooks: BombHooks) {
    this.scene = scene;
    this.hooks = hooks;
  }

  /** The live charges, so callers can overlap enemies against them. */
  public get group(): Phaser.Physics.Arcade.Group {
    if (!this.charges) {
      this.charges = this.scene.physics.add.group();
    }
    return this.charges;
  }

  /**
   * Binds the bombs to the level currently loaded. The platform collider is
   * registered on the level, so it dies with the geometry it referenced.
   */
  public beginLevel(world: LevelWorld): void {
    this.clear();
    this.world = world;
    world.collider(
      this.scene.physics.add.collider(this.group, world.platforms, (charge) => {
        this.stick(charge as Phaser.Physics.Arcade.Sprite);
      }),
    );
  }

  /** Lobs a charge. It arcs, so it can be thrown over a lip from below. */
  public throwCharge(origin: Vec2, facing: -1 | 1, heroVelocity: Vec2): void {
    const charge = this.group.create(
      origin.x,
      origin.y,
      WEAPON_TEXTURES.bomb,
    ) as Phaser.Physics.Arcade.Sprite;

    const velocity = throwVelocity(facing, heroVelocity);
    fitWidth(charge, FLYING_WIDTH);
    charge.setDepth(BOMB_DEPTH);
    charge.setVelocity(velocity.x, velocity.y);
    charge.setAngularVelocity(facing * 520);
    charge.setData(BURST_AT, undefined);

    // A charge that meets nothing still arms: a bomb thrown into open sky is a
    // wasted charge, not a bomb that never goes off.
    this.world?.delay(WEB_BOMB.flightMs, () => this.stick(charge));
  }

  /** Anchors a charge where it is and lights its fuse. Idempotent. */
  public stick(charge: Phaser.Physics.Arcade.Sprite): void {
    if (!charge.active || charge.getData(BURST_AT) !== undefined) {
      return;
    }

    charge.setData(BURST_AT, fuseEndsAt(this.hooks.now()));
    charge.setVelocity(0, 0);
    charge.setAngularVelocity(0);
    charge.setAngle(0);
    // Charges live in a dynamic group, so the body is always a dynamic one --
    // but `Sprite.body` is typed as the union with StaticBody, which has no
    // gravity to switch off.
    const body = charge.body;
    if (body && "setAllowGravity" in body) {
      body.setAllowGravity(false);
    }
    charge.setTexture(WEAPON_TEXTURES.bombArmed);
    charge.play(ARMED_ANIMATION, true);
    charge.setData(ARMED_SCALE, fitWidth(charge, ARMED_WIDTH));
    this.hooks.onStick();
  }

  /**
   * Burns the fuses. The telegraph is driven from the pure fuse rather than a
   * tween, so a charge cannot outlive the rule that governs it.
   *
   * `time` is the run clock, matching the stamp the fuse was lit with.
   */
  public update(time: number): void {
    if (!this.charges) {
      return;
    }

    for (const child of [...this.charges.getChildren()]) {
      const charge = child as Phaser.Physics.Arcade.Sprite;
      const burstAt = charge.getData(BURST_AT) as number | undefined;
      if (!charge.active || burstAt === undefined) {
        continue;
      }

      if (time >= burstAt) {
        this.burst(charge);
        continue;
      }

      const fuse = fuseProgress(burstAt, time);
      const base = (charge.getData(ARMED_SCALE) as number | undefined) ?? 1;
      charge.setTint(telegraphTint(fuse));
      charge.setScale(
        base *
          (1 +
            ARMED_SWELL * fuse +
            ARMED_PULSE * fuse * Math.sin(fuse * PULSE_CYCLES)),
      );
    }
  }

  private burst(charge: Phaser.Physics.Arcade.Sprite): void {
    const centre = { x: charge.x, y: charge.y };
    charge.destroy();
    this.spawnMesh(centre);
    this.hooks.onBurst(centre);
  }

  /** The spent web, thrown wide and faded out. Tracked by the level. */
  private spawnMesh(centre: Vec2): void {
    const world = this.world;
    if (!world) {
      return;
    }

    const mesh = world.track(
      this.scene.add
        .image(centre.x, centre.y, WEAPON_TEXTURES.mesh)
        .setDepth(MESH_DEPTH)
        .setAlpha(0.85),
    );
    // Thrown from a point out to the reach the burst actually had, so what the
    // player sees is the radius the rule used.
    const full = fitWidth(mesh, WEB_BOMB.radius * 2);
    mesh.setScale(full * 0.35);

    const tween: Phaser.Tweens.Tween = world.tween({
      targets: mesh,
      scale: full,
      alpha: 0,
      duration: WEB_BOMB.meshFadeMs,
      ease: "Cubic.out",
      onComplete: () => world.discard(mesh, tween),
    });
  }

  /** Drops every live charge. The level's own timers and tweens go with it. */
  public clear(): void {
    this.liveCharges?.clear(true, true);
    this.world = undefined;
  }

  public destroy(): void {
    this.clear();
    this.liveCharges?.destroy(true);
    this.charges = undefined;
  }

  /**
   * The group, unless Phaser has already taken it. Arcade tears its groups down
   * on scene shutdown before any scene listener runs, and touching a destroyed
   * one throws mid-teardown and abandons the rest of the restart.
   */
  private get liveCharges(): Phaser.Physics.Arcade.Group | undefined {
    return this.charges?.scene ? this.charges : undefined;
  }
}
