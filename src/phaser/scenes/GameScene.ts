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
import {
  damageEnemy,
  damagePlayer,
} from "../../game/simulation/systems/combat";
import {
  getLevelByIndex,
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

  private audio?: GameAudio;
  private previousMode: PlayerMode = "grounded";
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
    this.previousMode = "grounded";
    this.setUpAudio();
    this.audio?.music.setDistrict(this.state.progression.levelIndex);

    // Registered before anything it owns exists: Phaser's own groups tear
    // themselves down on this event in creation order, and a group destroyed
    // out from under `EnemyDirector.destroy()` throws mid-shutdown and leaves
    // the restart half-finished.
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      this.enemies?.destroy();
      this.webs?.destroy();
      this.audio?.setWind(0);
      // Phaser has already taken the level's groups, tweens and timers. Let
      // the handle go rather than leaving the next boot to tear down corpses.
      this.world = undefined;
    });

    createPropTextures(this);
    createCharacterAnimations(this);

    this.projectiles = this.physics.add.group({ allowGravity: false });
    this.builder = new LevelBuilder(this);
    this.enemies = new EnemyDirector(this, () => this.audio?.play("enemyShot"));
    this.webs = new WebRenderer(this);

    const player = this.physics.add.sprite(0, 0, artKeys.hero.idle[0]);
    player.setCollideWorldBounds(true);
    player.setDepth(8);
    applyBodyBox(player, BODY_BOXES.hero);
    player.play("player-idle");
    this.player = player;
    this.controller = new PlayerController(player);

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
    this.hud.render(this.state);
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

    if (this.state.progression.status === "playing") {
      this.updateRun(actions, time, delta);
    } else {
      this.player?.setVelocity(0, 0);
    }

    this.webs?.update();
    this.hud?.render(this.state);
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
    this.playMotionSounds(
      step,
      controller.speed,
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
   */
  private playMotionSounds(
    step: PlayerStep,
    speed: number,
    lift: number,
  ): void {
    const landed = step.mode === "grounded" && this.previousMode !== "grounded";
    this.previousMode = step.mode;

    const audio = this.audio;
    if (!audio) {
      return;
    }

    if (step.attached) {
      audio.play("webAttach");
    }
    if (step.released) {
      audio.play("webRelease");
    }
    if (step.jumped) {
      audio.play("jump");
    }
    if (landed) {
      audio.play("land");
    }
    if (step.mode === "swinging") {
      // Fired every frame; the recipe's own throttle paces it.
      audio.play("swing", speed / SWING_SOUND_RANGE);
    }

    audio.setWind(clamp(speed / WIND_SPEED_RANGE, 0, 1) * 0.7 + lift * 0.3);
  }

  private checkProgress(player: Phaser.Physics.Arcade.Sprite): void {
    const transition = syncLevelProgress(
      this.state,
      { x: player.x, y: player.y },
      this.lastPlayerPosition,
    );
    this.lastPlayerPosition = { x: player.x, y: player.y };

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

    enemies.spawn(level, this.state, world.platforms);
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
            projectile.destroy();
            if (power === "net") {
              enemies.snare(enemy);
              this.audio?.play("enemySnared");
            }
            const defeated = damageEnemy(
              this.state,
              enemy.state,
              power === "net" ? 12 : 16,
            );
            this.audio?.play(defeated ? "enemyDefeated" : "enemyHit");
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
    mode: "grounded" | "airborne" | "swinging",
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
      enemy.sprite.setTint(0xffffff);
      this.requireWorld().delay(90, () => {
        if (enemy.sprite.active) {
          enemy.sprite.clearTint();
        }
      });

      const defeated = damageEnemy(this.state, enemy.state, 20);
      this.audio?.play(defeated ? "enemyDefeated" : "enemyHit");
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
    const world = this.requireWorld();
    const burst = world.track(this.add.graphics().setDepth(9));
    burst.lineStyle(2, 0xeef8ff, 0.82);
    burst.strokeCircle(x, y, radius);
    burst.strokeCircle(x, y, radius * 0.55);
    for (let spoke = 0; spoke < 10; spoke += 1) {
      const angle = (Math.PI * 2 * spoke) / 10;
      burst.lineBetween(
        x,
        y,
        x + Math.cos(angle) * radius,
        y + Math.sin(angle) * radius,
      );
    }

    const tween: Phaser.Tweens.Tween = world.tween({
      targets: burst,
      alpha: 0,
      scale: 1.18,
      duration,
      ease: "Sine.out",
      onComplete: () => world.discard(burst, tween),
    });
  }

  private knockOut(player: Phaser.Physics.Arcade.Sprite): void {
    this.state.progression.status = "knockedOut";
    this.state.player.message = "You were knocked out. Press R to restart.";
    this.audio?.play("knockedOut");
    this.audio?.music.cue("knockedOut");
    this.audio?.setWind(0);
    this.webs?.clearLine();
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
