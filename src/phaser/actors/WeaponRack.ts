import type Phaser from "phaser";
import type { SoundEvent } from "../../audio/events";
import type { Vec2 } from "../../game/simulation/physics/vector";
import type { GadgetKind, GameState } from "../../game/simulation/state";
import {
  type AimTarget,
  ARSENAL,
  type ArsenalState,
  type BurstTarget,
  canFire,
  catchInBurst,
  createArsenal,
  gadgetAt,
  IMPACT_WEB,
  knockbackVelocity,
  nextGadget,
  pickYankTarget,
  refillArsenal,
  spendCharge,
  tickArsenal,
  WEB_BOMB,
  WEB_LINE,
  yankVelocity,
} from "../../game/simulation/systems/weapons";
import type { RunFeedback } from "../scenes/feedback";
import { spawnWebBurst } from "../scenes/webBurst";
import type { LevelWorld } from "../world/LevelWorld";
import { WEAPON_TEXTURES } from "../world/textures";
import type { EnemyDirector, EnemyView } from "./EnemyDirector";
import type { PlayerController } from "./PlayerController";
import { fitWidth } from "./placement";
import { WebBombs } from "./WebBombs";

/**
 * The hero's arsenal, as the scene sees it: one place that spends a charge,
 * dispatches the weapon and cleans up after it.
 *
 * Which weapon does what is a table rather than a chain of branches, so the
 * arsenal grows by adding a row here and a row in `systems/weapons/arsenal`.
 * Everything a weapon decides — what a burst catches, where a yank drags a
 * target, how many charges are left — is decided by that pure module; this
 * class only turns the answers into sprites, bodies and noise.
 */

/**
 * The two clocks a weapon reads.
 *
 * `scene` is wall time, which anything already loose in the world runs on: a
 * fuse burning, a tether fading, a shield that is up. `run` is the run clock,
 * which stops the moment the game is held — and everything the hero is *owed*
 * is measured against it, because time the player is not playing must not buy
 * them ammunition. Recharging off the scene clock made a twelve-second pause a
 * free reload of the whole arsenal, charged against nothing.
 */
export interface WeaponClock {
  readonly scene: number;
  readonly run: number;
}

/** How a weapon is fired, once its charge has been paid for. */
type Fire = (
  player: Phaser.Physics.Arcade.Sprite,
  facing: -1 | 1,
  time: number,
) => void;

/**
 * Every noise the arsenal makes, mapped onto the palette the game already has.
 * Five of these want voices of their own; naming them here means adding one is
 * a one-line change rather than a hunt through the class.
 */
const WEAPON_SOUND = {
  bombThrow: "webShot",
  bombArm: "gadgetCycle",
  bombBurst: "gadgetShield",
  impactFire: "webLaunch",
  impactHit: "melee",
  lineCast: "webAttach",
  lineMiss: "webRelease",
  netFire: "gadgetNet",
  netHit: "enemySnared",
  shield: "gadgetShield",
  wings: "gadgetWings",
  empty: "gadgetCycle",
} as const satisfies Record<string, SoundEvent>;

/** Which weapon a shot in flight came from. Decides what its hit does. */
type ShotWeapon = "net" | "impact";

const NET = {
  speed: 430,
  lift: -20,
  damage: 12,
  lifetimeMs: 1100,
  width: 48,
} as const;

const IMPACT_WIDTH = 44;
const DART_WIDTH = 26;
const SHOT_DEPTH = 9;
const TETHER_DEPTH = 10;

/** How long the web shield holds a shot off, in milliseconds. */
const SHIELD_MS = 1100;
/** The vault the web-wings give, in px/s. */
const WINGS_LIFT = -420;

const SHIELD_BURST = { radius: 58, durationMs: 760 } as const;
const WINGS_BURST = { radius: 42, durationMs: 520 } as const;

export interface WeaponRackDeps {
  readonly scene: Phaser.Scene;
  readonly state: GameState;
  readonly enemies: EnemyDirector;
  readonly feedback: RunFeedback;
  /** The hero's motion. The wings are the one weapon that moves them. */
  readonly controller: PlayerController;
  readonly play: (event: SoundEvent) => void;
}

export class WeaponRack {
  /** Charges held and owed. The HUD reads this; nothing else writes it. */
  public readonly ammo: ArsenalState = createArsenal();

  private readonly deps: WeaponRackDeps;
  private readonly bombs: WebBombs;
  private readonly dispatch: Record<GadgetKind, Fire>;
  private shotGroup?: Phaser.Physics.Arcade.Group;
  /** The latest clock, so a collider firing between frames can stamp a fuse. */
  private clock: WeaponClock = { scene: 0, run: 0 };
  private world?: LevelWorld;

  public constructor(deps: WeaponRackDeps) {
    this.deps = deps;
    this.bombs = new WebBombs(deps.scene, {
      now: () => this.clock.run,
      onStick: () => deps.play(WEAPON_SOUND.bombArm),
      onBurst: (centre) => this.burst(centre),
    });

    this.dispatch = {
      "web-bomb": (player, facing) => this.throwBomb(player, facing),
      "impact-web": (player, facing) => this.fireImpact(player, facing),
      "web-line": (player, facing) => this.castLine(player, facing),
      "web-net": (player, facing) => this.fireNet(player, facing),
      "web-shield": (player, _facing, time) => this.spinShield(player, time),
      "web-wings": (player, facing) => this.vault(player, facing),
    };
  }

  /** Shots in flight, so the scene can see what the arsenal has in the air. */
  public get shots(): Phaser.Physics.Arcade.Group {
    if (!this.shotGroup) {
      this.shotGroup = this.deps.scene.physics.add.group({
        allowGravity: false,
      });
    }
    return this.shotGroup;
  }

  /**
   * Binds the rack to the level currently loaded and resupplies the hero. Call
   * it after the enemies are spawned: the overlaps are registered per enemy.
   */
  public beginLevel(world: LevelWorld): void {
    this.clear();
    this.world = world;
    this.bombs.beginLevel(world);
    refillArsenal(this.ammo);

    for (const view of this.deps.enemies.all) {
      // Sprite first, group second: Arcade hands the lone sprite to the
      // callback before the group member, and the other order would treat the
      // enemy as the projectile.
      world.collider(
        this.deps.scene.physics.add.overlap(
          view.sprite,
          this.shots,
          (_, shot) =>
            this.landShot(view, shot as Phaser.Physics.Arcade.Sprite),
        ),
      );
      world.collider(
        this.deps.scene.physics.add.overlap(
          view.sprite,
          this.bombs.group,
          (_, charge) =>
            this.bombs.stick(charge as Phaser.Physics.Arcade.Sprite),
        ),
      );
    }
  }

  /** Recharges and burns fuses. Run once a frame; each reads its own clock. */
  public update(clock: WeaponClock): void {
    this.clock = clock;
    tickArsenal(this.ammo, clock.run);
    this.bombs.update(clock.run);
  }

  /** Whether the selected weapon could be fired right now. */
  public ready(clock: WeaponClock): boolean {
    return canFire(this.ammo, this.deps.state.player.gadget, clock.run);
  }

  public cycle(step: 1 | -1 = 1): void {
    const player = this.deps.state.player;
    player.gadget = nextGadget(player.gadget, step);
    player.message = `${ARSENAL[player.gadget].label} ready.`;
  }

  /** Selects a weapon by slot. Out-of-range slots leave the selection alone. */
  public select(index: number): void {
    const kind = gadgetAt(index);
    if (!kind) {
      return;
    }
    this.deps.state.player.gadget = kind;
    this.deps.state.player.message = `${ARSENAL[kind].label} ready.`;
  }

  /**
   * Fires the selected weapon, if there is a charge for it. A slot on cooldown
   * says nothing; an empty one says so, because the player needs to know why
   * nothing happened.
   */
  public use(player: Phaser.Physics.Arcade.Sprite, clock: WeaponClock): void {
    const kind = this.deps.state.player.gadget;
    tickArsenal(this.ammo, clock.run);

    if (clock.run < this.ammo.readyAt) {
      return;
    }
    if (!spendCharge(this.ammo, kind, clock.run)) {
      this.deps.state.player.message = ARSENAL[kind].emptyMessage;
      this.deps.play(WEAPON_SOUND.empty);
      return;
    }

    this.deps.state.player.message = ARSENAL[kind].firedMessage;
    // What the weapon then puts into the world is the scene's to time.
    this.dispatch[kind](player, player.flipX ? -1 : 1, clock.scene);
  }

  private throwBomb(
    player: Phaser.Physics.Arcade.Sprite,
    facing: -1 | 1,
  ): void {
    const velocity = player.body?.velocity;
    this.bombs.throwCharge(
      { x: player.x + facing * 26, y: player.y - 12 },
      facing,
      { x: velocity?.x ?? 0, y: velocity?.y ?? 0 },
    );
    this.deps.play(WEAPON_SOUND.bombThrow);
  }

  private fireImpact(
    player: Phaser.Physics.Arcade.Sprite,
    facing: -1 | 1,
  ): void {
    const shot = this.launchShot(
      player,
      facing,
      "impact",
      WEAPON_TEXTURES.impact,
      IMPACT_WIDTH,
    );
    shot.setVelocity(facing * IMPACT_WEB.speed, 0);
    shot.setFlipX(facing < 0);
    this.world?.delay(IMPACT_WEB.lifetimeMs, () => shot.destroy());
    this.deps.play(WEAPON_SOUND.impactFire);
  }

  private fireNet(player: Phaser.Physics.Arcade.Sprite, facing: -1 | 1): void {
    const shot = this.launchShot(
      player,
      facing,
      "net",
      WEAPON_TEXTURES.net,
      NET.width,
    );
    shot.setVelocity(facing * NET.speed, NET.lift);
    this.world?.delay(NET.lifetimeMs, () => shot.destroy());
    this.deps.play(WEAPON_SOUND.netFire);
  }

  private launchShot(
    player: Phaser.Physics.Arcade.Sprite,
    facing: -1 | 1,
    weapon: ShotWeapon,
    texture: string,
    width: number,
  ): Phaser.Physics.Arcade.Sprite {
    const shot = this.shots.create(
      player.x + facing * 30,
      player.y - 8,
      texture,
    ) as Phaser.Physics.Arcade.Sprite;

    fitWidth(shot, width);
    shot.setDepth(SHOT_DEPTH);
    shot.setData("weapon", weapon);
    shot.setData("facing", facing);
    return shot;
  }

  private landShot(view: EnemyView, shot: Phaser.Physics.Arcade.Sprite): void {
    if (!shot.active || !view.sprite.active) {
      return;
    }

    const weapon = shot.getData("weapon") as ShotWeapon;
    const facing = shot.getData("facing") as -1 | 1;
    // Read before it is destroyed: the sparks fly from where the web struck.
    const struckAt = { x: shot.x, y: shot.y };
    shot.destroy();

    if (weapon === "net") {
      this.deps.enemies.snare(view);
      this.deps.play(WEAPON_SOUND.netHit);
    } else {
      this.deps.enemies.snare(view, IMPACT_WEB.staggerMs);
      this.deps.enemies.launch(
        view,
        knockbackVelocity(facing),
        IMPACT_WEB.holdMs,
      );
      this.deps.play(WEAPON_SOUND.impactHit);
    }

    this.strike(
      view,
      weapon === "net" ? NET.damage : IMPACT_WEB.damage,
      struckAt,
    );
  }

  /**
   * The tether. It picks its own target from a cone, because the hero is
   * usually mid-arc and pointing somewhere other than at what they meant to
   * hit, and drags it into fist range.
   */
  private castLine(player: Phaser.Physics.Arcade.Sprite, facing: -1 | 1): void {
    const hero = { x: player.x, y: player.y };
    const target = pickYankTarget(hero, facing, this.aimTargets());
    if (!target) {
      this.deps.state.player.message = "The line found nothing.";
      this.deps.play(WEAPON_SOUND.lineMiss);
      return;
    }

    const view = this.viewOf(target.id);
    if (view) {
      this.deps.enemies.snare(view, WEB_LINE.tangleMs);
      this.deps.enemies.launch(
        view,
        yankVelocity(target.position, hero),
        WEB_LINE.holdMs,
      );
    }
    this.drawTether(hero, target.position);
    this.deps.play(WEAPON_SOUND.lineCast);
  }

  private spinShield(player: Phaser.Physics.Arcade.Sprite, time: number): void {
    this.deps.state.player.shieldUntil = time + SHIELD_MS;
    this.burstAt(player.x, player.y, SHIELD_BURST);
    this.deps.play(WEAPON_SOUND.shield);
  }

  private vault(player: Phaser.Physics.Arcade.Sprite, facing: -1 | 1): void {
    // Through the controller: the sim owns velocity, and a `setVelocityY` on
    // the body is erased by the next `commit` — the vault used to survive one
    // 1/60 step, about seven pixels of lift.
    this.deps.controller.lift(WINGS_LIFT);
    this.burstAt(player.x - facing * 22, player.y + 8, WINGS_BURST);
    this.deps.play(WEAPON_SOUND.wings);
  }

  /** Everything a bomb caught, paid out nearest first. */
  private burst(centre: Vec2): void {
    this.deps.play(WEAPON_SOUND.bombBurst);
    let caught = 0;

    for (const hit of catchInBurst(centre, this.burstTargets())) {
      const view = this.viewOf(hit.id);
      if (!view?.sprite.active) {
        continue;
      }
      caught += 1;
      this.deps.enemies.snare(view, WEB_BOMB.holdMs);
      this.strike(view, hit.damage, { x: view.sprite.x, y: view.sprite.y });
    }

    if (caught > 1) {
      this.deps.state.player.message = `Web bomb caught ${caught}.`;
    }
  }

  /** Applies a blow through the run's feedback, and retires what it finishes. */
  private strike(view: EnemyView, amount: number, at: Vec2): void {
    const defeated = this.deps.feedback.damage(
      this.deps.state,
      view.state,
      amount,
      "shot",
      view.sprite,
      at,
    );
    if (defeated) {
      this.deps.enemies.defeat(view);
    }
  }

  /**
   * What a burst may catch. The boss is included — a bomb staggers it exactly
   * as a net does, and its own snare lock is what stops that being a lock.
   */
  private burstTargets(): BurstTarget[] {
    return this.livingViews().map((view) => ({
      id: view.state.id,
      position: { x: view.sprite.x, y: view.sprite.y },
    }));
  }

  /** What the line may tether. The boss is not on it: it belongs to its arena. */
  private aimTargets(): AimTarget[] {
    return this.livingViews()
      .filter((view) => !view.boss)
      .map((view) => ({
        id: view.state.id,
        position: { x: view.sprite.x, y: view.sprite.y },
      }));
  }

  private livingViews(): EnemyView[] {
    return this.deps.enemies.all.filter((view) => view.sprite.active);
  }

  private viewOf(id: string): EnemyView | undefined {
    return this.deps.enemies.all.find((view) => view.state.id === id);
  }

  private burstAt(
    x: number,
    y: number,
    shape: { radius: number; durationMs: number },
  ): void {
    const world = this.world;
    if (world) {
      spawnWebBurst(
        this.deps.scene,
        world,
        x,
        y,
        shape.radius,
        shape.durationMs,
      );
    }
  }

  /** The tether, drawn from the hero to what it caught and faded out. */
  private drawTether(hero: Vec2, target: Vec2): void {
    const world = this.world;
    if (!world) {
      return;
    }

    const line = world.track(
      this.deps.scene.add.graphics().setDepth(TETHER_DEPTH),
    );
    line.lineStyle(3, 0xeef8ff, 0.9);
    line.lineBetween(hero.x, hero.y, target.x, target.y);

    const dart = world.track(
      this.deps.scene.add
        .image(target.x, target.y, WEAPON_TEXTURES.dart)
        .setDepth(TETHER_DEPTH)
        .setRotation(Math.atan2(hero.y - target.y, hero.x - target.x)),
    );
    fitWidth(dart, DART_WIDTH);

    const fade: Phaser.Tweens.Tween = world.tween({
      targets: [line, dart],
      alpha: 0,
      duration: WEB_LINE.traceMs,
      onComplete: () => {
        world.discard(line, fade);
        world.discard(dart, fade);
      },
    });
  }

  /** Drops everything the level owned. The level's own tweens go with it. */
  public clear(): void {
    this.liveShots?.clear(true, true);
    this.bombs.clear();
    this.world = undefined;
  }

  public destroy(): void {
    this.clear();
    this.liveShots?.destroy(true);
    this.shotGroup = undefined;
    this.bombs.destroy();
  }

  /**
   * The shot group, unless Phaser has already taken it. Arcade tears its groups
   * down on scene shutdown before any scene listener runs, and touching a
   * destroyed one throws mid-teardown and abandons the restart.
   */
  private get liveShots(): Phaser.Physics.Arcade.Group | undefined {
    return this.shotGroup?.scene ? this.shotGroup : undefined;
  }
}
