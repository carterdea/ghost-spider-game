import Phaser from "phaser";
import { createAudio, type GameAudio } from "../../audio";
import { artKeys, preloadArt } from "../../game/assets/manifest";
import { LEVELS, type LevelDefinition } from "../../game/content/levels";
import { type ActionState, createEmptyActions } from "../../game/input/actions";
import { createKeyboardBindings, readActions } from "../../game/input/bindings";
import type { Vec2 } from "../../game/simulation/physics/vector";
import { clamp } from "../../game/simulation/physics/vector";
import {
  createInitialGameState,
  enterLevel,
  type GadgetKind,
  type GameState,
} from "../../game/simulation/state";
import { damagePlayer } from "../../game/simulation/systems/combat";
import {
  getLevelByIndex,
  isFinalLevelIndex,
  isGoalReached,
  syncLevelProgress,
} from "../../game/simulation/systems/progression";
import { Hud } from "../../ui/hud/hud";
import { createCharacterAnimations } from "../actors/animations";
import { EnemyDirector, type EnemyView } from "../actors/EnemyDirector";
import {
  PlayerController,
  type PlayerMode,
  type PlayerStep,
} from "../actors/PlayerController";
import { applyBodyBox, BODY_BOXES } from "../actors/placement";
import { WebRenderer } from "../fx/WebRenderer";
import { LevelBuilder } from "../world/LevelBuilder";
import type { LevelWorld } from "../world/LevelWorld";
import { createPropTextures } from "../world/textures";
import { bossSound, bossSpawnFor } from "./bossBinding";
import { RunFeedback } from "./feedback";
import { spawnWebBurst } from "./webBurst";

const GADGETS: GadgetKind[] = ["web-net", "web-shield", "web-wings"];
const ATTACK_COOLDOWN = 280;
const GADGET_COOLDOWN = 650;
const HIT_COOLDOWN = 700;
const STRIKE_RANGE = 96;

/** Camera eases out as the hero picks up speed, so fast swings read wider. */
const ZOOM_NEAR = 1;
const ZOOM_FAR = 0.82;
const ZOOM_SPEED_RANGE = 900;

/** Speed that maps to a full-intensity swing whoosh: the swing solver's cap. */
const SWING_SOUND_RANGE = 1250;
/** Speed that maps to a full wind bed. */
const WIND_SPEED_RANGE = 1000;

export class GameScene extends Phaser.Scene {
  private state: GameState = createInitialGameState(LEVELS[0]);
  private hud?: Hud;
  private keys?: ReturnType<typeof createKeyboardBindings>;
  private previousActions: ActionState = createEmptyActions();

  private player?: Phaser.Physics.Arcade.Sprite;
  private controller?: PlayerController;
  private builder?: LevelBuilder;
  private enemies?: EnemyDirector;
  private webs?: WebRenderer;
  private projectiles?: Phaser.Physics.Arcade.Group;
  private world?: LevelWorld;
  private feedback?: RunFeedback;

  private audio?: GameAudio;
  /** Last frame's position, so a fast swing cannot tunnel through the goal. */
  private lastPlayerPosition: Vec2 = { x: 0, y: 0 };

  private attackCooldownUntil = 0;
  private gadgetCooldownUntil = 0;
  private hitCooldownUntil = 0;
  private shieldView?: Phaser.GameObjects.Arc;

  public constructor() {
    super("game");
  }

  public preload(): void {
    for (const asset of preloadArt) {
      this.load.image(asset.key, asset.path);
    }
  }

  public create(): void {
    this.state = createInitialGameState(LEVELS[0]);
    this.setUpAudio();
    this.audio?.music.setDistrict(this.state.progression.levelIndex);

    // Registered before anything it owns exists: Phaser's own groups tear
    // themselves down on this event in creation order, and a group destroyed
    // out from under `EnemyDirector.destroy()` throws mid-shutdown and leaves
    // the restart half-finished.
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      this.enemies?.destroy();
      this.webs?.destroy();
      this.feedback?.destroy();
      this.audio?.setWind(0);
      // Phaser has already taken the level's groups, tweens and timers. Let
      // the handle go rather than leaving the next boot to tear down corpses.
      this.world = undefined;
    });

    createPropTextures(this);
    createCharacterAnimations(this);

    this.projectiles = this.physics.add.group({ allowGravity: false });
    this.builder = new LevelBuilder(this);
    this.enemies = new EnemyDirector(
      this,
      () => this.audio?.play("enemyShot"),
      (event) => this.audio?.play(bossSound(event)),
    );
    this.webs = new WebRenderer(this);

    const player = this.physics.add.sprite(0, 0, artKeys.hero.idle[0]);
    player.setCollideWorldBounds(true);
    player.setDepth(8);
    applyBodyBox(player, BODY_BOXES.hero);
    player.play("player-idle");
    this.player = player;
    this.controller = new PlayerController(player);
    this.feedback = new RunFeedback(this, player, this.audio);

    this.cameras.main.startFollow(player, true, 0.09, 0.09);
    this.cameras.main.setDeadzone(180, 130);

    this.loadLevel(getLevelByIndex(0));

    const hudRoot = document.getElementById("hud");
    if (!hudRoot) {
      throw new Error("Missing HUD root.");
    }
    this.hud = new Hud(hudRoot);
    this.keys = createKeyboardBindings(this);
    // Seeded from the live keys rather than an empty set: a restart triggered
    // while R is still held would otherwise read as a fresh press next frame
    // and restart again on every frame the key stays down.
    this.previousActions = readActions(this.keys);
    this.renderHud();
  }

  /** Chain and mute live outside `GameState`, so both call sites go through here. */
  private renderHud(): void {
    this.hud?.render(
      this.state,
      this.feedback?.combo.count ?? 0,
      this.audio?.isMuted() ?? false,
    );
  }

  /**
   * One audio surface for the whole page. A restart tears the scene down but
   * keeps this object: browsers cap how many AudioContexts a page may open, so
   * building a fresh one per restart would run the game out of them. It is
   * destroyed with the game rather than with the scene for the same reason.
   */
  private setUpAudio(): void {
    if (!this.audio) {
      const audio = createAudio();
      this.audio = audio;
      this.game.events.once(Phaser.Core.Events.DESTROY, () => audio.destroy());
    }

    // A context only runs once the page has been touched, so the score waits
    // for the first keypress rather than starting with the scene.
    this.input.keyboard?.once("keydown", () => this.audio?.music.start());

    this.input.keyboard?.on("keydown-M", () => {
      const audio = this.audio;
      if (!audio) {
        return;
      }
      audio.setMuted(!audio.isMuted());
      this.state.player.message = audio.isMuted() ? "Sound off." : "Sound on.";
    });
  }

  public update(time: number, delta: number): void {
    const actions = this.keys ? readActions(this.keys) : createEmptyActions();

    if (this.wasPressed(actions, "reset")) {
      this.previousActions = actions;
      this.audio?.setWind(0);
      this.audio?.music.setIdle();
      this.scene.restart();
      return;
    }

    // The world runs slow for a beat after a blow lands. Everything that moves
    // reads the same delta, so the freeze cannot pull the game out of step.
    const simDelta = this.feedback?.step(delta) ?? delta;

    if (this.state.progression.status === "playing") {
      this.updateRun(actions, time, simDelta);
    } else {
      this.player?.setVelocity(0, 0);
    }

    this.webs?.update();
    this.renderHud();
    this.previousActions = actions;
  }

  private updateRun(actions: ActionState, time: number, delta: number): void {
    const player = this.requirePlayer();
    const controller = this.requireController();
    const level = getLevelByIndex(this.state.progression.levelIndex);

    const step = controller.update(
      actions,
      this.wasPressed(actions, "jump"),
      actions.web,
      level.anchors,
      level.streetY,
      delta,
    );

    this.state.player.swinging = step.mode === "swinging";
    this.renderWeb(player, step.rope?.anchor, step.released);
    this.animatePlayer(player, actions, step.mode);
    this.feedback?.lean(step.mode, player.body?.velocity.x ?? 0, delta);
    this.feedback?.land(step.landingImpact);
    this.playMotionSounds(
      step,
      controller,
      1 - clamp(player.y / level.height, 0, 1),
    );

    if (this.wasPressed(actions, "cycleGadget")) {
      this.cycleGadget();
    }
    if (
      this.wasPressed(actions, "attack") &&
      time >= this.attackCooldownUntil
    ) {
      this.attack(player, time);
    }
    if (
      this.wasPressed(actions, "gadget") &&
      time >= this.gadgetCooldownUntil
    ) {
      this.useGadget(player, time);
    }

    this.enemies?.update(time, player);
    this.updateShield(player, time);
    this.updateCameraZoom(controller.speed, delta);

    if (this.state.player.health === 0) {
      this.knockOut(player);
      return;
    }

    this.checkProgress(player);
  }

  /**
   * One physics step as sound: transitions fire one-shots, sustained speed and
   * altitude feed the wind bed. `lift` is 0 at street level, 1 at the skyline.
   *
   * Landing is deliberately absent. It is reported by `landingImpact`, which
   * carries the weight of the arrival and also fires when a swing clips a roof
   * — a landing the grounded/airborne transition never sees.
   */
  private playMotionSounds(
    step: PlayerStep,
    controller: PlayerController,
    lift: number,
  ): void {
    const audio = this.audio;
    if (!audio) {
      return;
    }

    const speed = controller.speed;
    if (step.attached) {
      // A catch that has to shove off a rooftop is heavier than one made in
      // open air, and it gets the heavier sound.
      audio.play(controller.isLaunching ? "webLaunch" : "webAttach");
    }
    if (step.released) {
      audio.play("webRelease");
    }
    if (step.jumped) {
      audio.play("jump");
    }
    if (step.mode === "swinging") {
      // Fired every frame; the recipe's own throttle paces it.
      audio.play("swing", speed / SWING_SOUND_RANGE);
    }

    audio.setWind(clamp(speed / WIND_SPEED_RANGE, 0, 1) * 0.7 + lift * 0.3);
  }

  private checkProgress(player: Phaser.Physics.Arcade.Sprite): void {
    const position = { x: player.x, y: player.y };
    const previous = this.lastPlayerPosition;
    this.lastPlayerPosition = position;

    if (this.bossHoldsTheGoal(position, previous)) {
      return;
    }

    const transition = syncLevelProgress(this.state, position, previous);

    if (transition.kind === "advanced") {
      this.audio?.play("levelAdvance");
      // The arrangement swells into the next district's layer on its own.
      this.audio?.music.setDistrict(this.state.progression.levelIndex);
      this.cameras.main.flash(360, 84, 230, 236, false);
      enterLevel(this.state, transition.level);
      this.loadLevel(transition.level);
      return;
    }

    if (transition.kind === "won") {
      // `syncLevelProgress` already marked the run cleared.
      this.state.player.score += 1000;
      this.audio?.play("levelCleared");
      this.audio?.music.cue("levelCleared");
      this.audio?.setWind(0);
      this.cameras.main.flash(700, 255, 255, 255, false);
      this.player?.setVelocity(0, 0);
    }
  }

  /**
   * The finale beacon stays cold while the Weaver is up. `enemies.boss` only
   * exists on the final level and goes undefined the moment it is defeated, so
   * this is the whole rule. Checked before the goal is synced rather than after,
   * because clearing the run is the one transition that cannot be taken back.
   */
  private bossHoldsTheGoal(position: Vec2, previous: Vec2): boolean {
    if (!this.enemies?.boss) {
      return false;
    }

    const level = getLevelByIndex(this.state.progression.levelIndex);
    if (!isGoalReached(level, position, previous)) {
      return false;
    }

    this.state.player.message = "The Weaver holds the bridge. Bring it down.";
    return true;
  }

  private loadLevel(level: LevelDefinition): void {
    this.teardownLevel();
    this.resetTransientState();

    const builder = this.builder;
    const enemies = this.enemies;
    const controller = this.requireController();
    if (!builder || !enemies) {
      throw new Error("Scene systems have not been created.");
    }

    const world = builder.build(level);
    this.world = world;

    const player = this.requirePlayer();
    controller.reset(level.playerSpawn);
    this.lastPlayerPosition = { x: player.x, y: player.y };
    world.collider(this.physics.add.collider(player, world.platforms));

    // Between the two: `spawn` clears everything first, and `registerCombat`
    // walks `enemies.all`, which the boss has to be in by then.
    enemies.spawn(level, this.state, world.platforms);
    if (isFinalLevelIndex(this.state.progression.levelIndex)) {
      enemies.spawnBoss(bossSpawnFor(level), this.state);
    }
    this.registerCombat(player, enemies, world);

    this.cameras.main.setBounds(0, 0, level.width, level.height);
    this.cameras.main.centerOn(level.playerSpawn.x, level.playerSpawn.y);
  }

  /** Cooldowns and camera framing belong to the run, not to the next level. */
  private resetTransientState(): void {
    this.attackCooldownUntil = 0;
    this.gadgetCooldownUntil = 0;
    this.hitCooldownUntil = 0;
    this.cameras.main.setZoom(ZOOM_NEAR);
  }

  private teardownLevel(): void {
    this.enemies?.clear();
    this.projectiles?.clear(true, true);
    this.shieldView?.destroy();
    this.shieldView = undefined;
    this.webs?.reset();
    this.feedback?.reset();
    this.world?.destroy();
    this.world = undefined;
  }

  private registerCombat(
    player: Phaser.Physics.Arcade.Sprite,
    enemies: EnemyDirector,
    world: LevelWorld,
  ): void {
    world.collider(
      this.physics.add.overlap(player, enemies.bullets, (_, bulletObject) => {
        (bulletObject as Phaser.Physics.Arcade.Sprite).destroy();
        if (this.time.now < this.state.player.shieldUntil) {
          this.audio?.play("shieldBlock");
          this.state.player.message = "Web shield caught the shot.";
          return;
        }
        damagePlayer(this.state, 12, "Hit by a skyline shot.");
        this.feedback?.hurt();
        // Silent at zero health: `knockOut` has its own, louder sound.
        if (this.state.player.health > 0) {
          this.audio?.play("playerHurt");
        }
      }),
    );

    for (const enemy of enemies.all) {
      // Sprite first, group second: Arcade hands the callback the lone sprite
      // before the group member, so the other order would treat the enemy as
      // the projectile and destroy it on the first hit.
      world.collider(
        this.physics.add.overlap(
          enemy.sprite,
          this.requireProjectiles(),
          (_, projectileObject) => {
            const projectile = projectileObject as Phaser.Physics.Arcade.Sprite;
            if (!projectile.active) {
              return;
            }
            const power = projectile.getData("power") as "glob" | "net";
            // Read before it is destroyed: the sparks fly from where the web
            // struck, not from the enemy's centre.
            const struckAt = { x: projectile.x, y: projectile.y };
            projectile.destroy();
            if (power === "net") {
              enemies.snare(enemy);
              this.audio?.play("enemySnared");
            }
            const defeated = this.requireFeedback().damage(
              this.state,
              enemy.state,
              power === "net" ? 12 : 16,
              "shot",
              enemy.sprite,
              struckAt,
            );
            if (defeated) {
              enemies.defeat(enemy);
            }
          },
        ),
      );

      world.collider(
        this.physics.add.overlap(player, enemy.sprite, () => {
          if (
            this.time.now < this.hitCooldownUntil ||
            this.time.now < enemy.snaredUntil
          ) {
            return;
          }
          this.hitCooldownUntil = this.time.now + HIT_COOLDOWN;
          damagePlayer(this.state, enemy.state.damage, contactMessage(enemy));
          this.feedback?.hurt();
          if (this.state.player.health > 0) {
            this.audio?.play("playerHurt");
          }
        }),
      );
    }
  }

  private renderWeb(
    player: Phaser.Physics.Arcade.Sprite,
    anchor: Vec2 | undefined,
    released: boolean,
  ): void {
    const webs = this.webs;
    if (!webs) {
      return;
    }

    if (!anchor) {
      const cut = released ? this.controller?.releasedAnchor : undefined;
      if (cut) {
        webs.release(cut, handPosition(player));
      } else {
        webs.clearLine();
      }
      return;
    }

    webs.drawLine(anchor, handPosition(player));
  }

  private animatePlayer(
    player: Phaser.Physics.Arcade.Sprite,
    actions: ActionState,
    mode: PlayerMode,
  ): void {
    const velocityX = player.body?.velocity.x ?? 0;
    if (Math.abs(velocityX) > 40) {
      player.setFlipX(velocityX < 0);
    }

    if (mode === "swinging") {
      player.anims.play("player-swing", true);
      return;
    }

    if (mode === "airborne" && actions.glide) {
      player.anims.stop();
      player.setTexture(artKeys.hero.glide);
      return;
    }

    if (mode === "grounded" && Math.abs(velocityX) > 60) {
      player.play("player-run", true);
      this.audio?.play("footstep");
      return;
    }

    player.play("player-idle", true);
  }

  private updateCameraZoom(speed: number, delta: number): void {
    const target = Phaser.Math.Linear(
      ZOOM_NEAR,
      ZOOM_FAR,
      clamp(speed / ZOOM_SPEED_RANGE, 0, 1),
    );
    const camera = this.cameras.main;
    camera.setZoom(
      Phaser.Math.Linear(camera.zoom, target, Math.min(1, delta / 260)),
    );
  }

  private attack(player: Phaser.Physics.Arcade.Sprite, time: number): void {
    this.attackCooldownUntil = time + ATTACK_COOLDOWN;
    const facing = player.flipX ? -1 : 1;

    if (this.tryCloseStrike(player, facing)) {
      return;
    }

    this.fireWebProjectile(
      player.x + facing * 30,
      player.y - 8,
      facing,
      "glob",
    );
    this.state.player.message = "Web glob fired.";
  }

  private tryCloseStrike(
    player: Phaser.Physics.Arcade.Sprite,
    facing: number,
  ): boolean {
    const hitX = player.x + facing * 56;

    for (const enemy of this.enemies?.all ?? []) {
      if (!enemy.sprite.active) {
        continue;
      }
      const distance = Phaser.Math.Distance.Between(
        hitX,
        player.y,
        enemy.sprite.x,
        enemy.sprite.y,
      );
      if (distance > STRIKE_RANGE) {
        continue;
      }

      this.audio?.play("melee");
      enemy.sprite.setVelocityX(facing * 240);

      const defeated = this.requireFeedback().damage(
        this.state,
        enemy.state,
        20,
        "melee",
        enemy.sprite,
        { x: enemy.sprite.x, y: enemy.sprite.y },
      );
      if (defeated) {
        this.enemies?.defeat(enemy);
      }
      return true;
    }

    return false;
  }

  private fireWebProjectile(
    x: number,
    y: number,
    facing: number,
    power: "glob" | "net",
  ): void {
    const projectile = this.requireProjectiles().create(
      x,
      y,
      power === "net" ? "webNet" : "webGlob",
    ) as Phaser.Physics.Arcade.Sprite;

    projectile.setData("power", power);
    projectile.setDepth(9);
    if (power === "glob") {
      this.audio?.play("webShot");
    }
    projectile.setVelocity(
      facing * (power === "net" ? 430 : 560),
      power === "net" ? -20 : 0,
    );

    this.requireWorld().delay(1100, () => projectile.destroy());
  }

  private cycleGadget(): void {
    const next =
      (GADGETS.indexOf(this.state.player.gadget) + 1) % GADGETS.length;
    this.state.player.gadget = GADGETS[next];
    this.audio?.play("gadgetCycle");
    this.state.player.message = `Gadget ready: ${this.state.player.gadget}.`;
  }

  private useGadget(player: Phaser.Physics.Arcade.Sprite, time: number): void {
    this.gadgetCooldownUntil = time + GADGET_COOLDOWN;
    const facing = player.flipX ? -1 : 1;

    if (this.state.player.gadget === "web-net") {
      this.fireWebProjectile(
        player.x + facing * 32,
        player.y - 8,
        facing,
        "net",
      );
      this.audio?.play("gadgetNet");
      this.state.player.message = "Web net launched.";
      return;
    }

    if (this.state.player.gadget === "web-shield") {
      this.state.player.shieldUntil = time + 1100;
      this.createWebBurst(player.x, player.y, 58, 760);
      this.audio?.play("gadgetShield");
      this.state.player.message = "Web shield spun.";
      return;
    }

    player.setVelocityY(-420);
    this.createWebBurst(player.x - facing * 22, player.y + 8, 42, 520);
    this.audio?.play("gadgetWings");
    this.state.player.message = "Web-wings vault.";
  }

  private updateShield(
    player: Phaser.Physics.Arcade.Sprite,
    time: number,
  ): void {
    if (time >= this.state.player.shieldUntil) {
      this.shieldView?.destroy();
      this.shieldView = undefined;
      return;
    }

    if (!this.shieldView) {
      this.shieldView = this.add
        .circle(player.x, player.y, 54)
        .setStrokeStyle(4, 0xeef8ff, 0.82)
        .setFillStyle(0xeef8ff, 0.08)
        .setDepth(9);
    }
    this.shieldView.setPosition(player.x, player.y);
  }

  private createWebBurst(
    x: number,
    y: number,
    radius: number,
    duration: number,
  ): void {
    spawnWebBurst(this, this.requireWorld(), x, y, radius, duration);
  }

  private knockOut(player: Phaser.Physics.Arcade.Sprite): void {
    this.state.progression.status = "knockedOut";
    this.state.player.message = "You were knocked out. Press R to restart.";
    this.audio?.play("knockedOut");
    this.audio?.music.cue("knockedOut");
    this.audio?.setWind(0);
    this.webs?.clearLine();
    // Before the pose: the blow that finished the hero left a white flash on
    // them, and retiring it a frame later would wipe the knocked-out tint.
    this.feedback?.reset();
    player.setVelocity(0, 0);
    player.anims.stop();
    player.setTexture(artKeys.hero.glide);
    player.setAngle(90);
    player.setTint(0xffd1f0);
    this.cameras.main.shake(360, 0.006);
  }

  private wasPressed(actions: ActionState, action: keyof ActionState): boolean {
    return actions[action] && !this.previousActions[action];
  }

  private requirePlayer(): Phaser.Physics.Arcade.Sprite {
    if (!this.player) {
      throw new Error("Player has not been created.");
    }
    return this.player;
  }

  /** The level currently loaded. Every level-scoped resource hangs off it. */
  private requireWorld(): LevelWorld {
    if (!this.world) {
      throw new Error("No level is loaded.");
    }
    return this.world;
  }

  private requireProjectiles(): Phaser.Physics.Arcade.Group {
    if (!this.projectiles) {
      throw new Error("Projectiles have not been created.");
    }
    return this.projectiles;
  }

  private requireController(): PlayerController {
    if (!this.controller) {
      throw new Error("Player controller has not been created.");
    }
    return this.controller;
  }

  private requireFeedback(): RunFeedback {
    if (!this.feedback) {
      throw new Error("Run feedback has not been created.");
    }
    return this.feedback;
  }
}

/**
 * The hero's raised fist, in sprite-local pixels from the centre. It holds
 * still across all four swing frames, so the strand can hang off a constant.
 */
const FIST_OFFSET: Vec2 = { x: -1, y: -54 };

const handPosition = (player: Phaser.Physics.Arcade.Sprite): Vec2 => ({
  x: player.x + (player.flipX ? -FIST_OFFSET.x : FIST_OFFSET.x),
  y: player.y + FIST_OFFSET.y,
});

const contactMessage = (enemy: EnemyView): string => {
  if (enemy.state.kind === "gunner") {
    return "Close-range blast.";
  }
  return enemy.state.kind === "drone" ? "Drone zap." : "Robot tackle.";
};
