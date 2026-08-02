import Phaser from "phaser";
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
import { EnemyDirector, type EnemyView } from "../actors/EnemyDirector";
import { PlayerController } from "../actors/PlayerController";
import { applyBodyBox, BODY_BOXES } from "../actors/placement";
import { WebRenderer } from "../fx/WebRenderer";
import { LevelBuilder, type LevelWorld } from "../world/LevelBuilder";
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
  private world?: LevelWorld;
  private colliders: Phaser.Physics.Arcade.Collider[] = [];

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
    this.previousActions = createEmptyActions();
    this.colliders = [];
    this.attackCooldownUntil = 0;
    this.gadgetCooldownUntil = 0;
    this.hitCooldownUntil = 0;

    createPropTextures(this);
    this.createAnimations();

    this.builder = new LevelBuilder(this);
    this.enemies = new EnemyDirector(this);
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
    this.hud.render(this.state);
  }

  public update(time: number, delta: number): void {
    const actions = this.keys ? readActions(this.keys) : createEmptyActions();

    if (this.wasPressed(actions, "reset")) {
      this.previousActions = actions;
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

  private checkProgress(player: Phaser.Physics.Arcade.Sprite): void {
    const transition = syncLevelProgress(this.state, {
      x: player.x,
      y: player.y,
    });

    if (transition.kind === "advanced") {
      this.cameras.main.flash(360, 84, 230, 236, false);
      enterLevel(this.state, transition.level);
      this.loadLevel(transition.level);
      return;
    }

    if (transition.kind === "won") {
      this.state.progression.status = "cleared";
      this.state.player.score += 1000;
      this.cameras.main.flash(700, 255, 255, 255, false);
      this.player?.setVelocity(0, 0);
    }
  }

  private loadLevel(level: LevelDefinition): void {
    this.teardownLevel();

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
    this.colliders.push(this.physics.add.collider(player, world.platforms));

    enemies.spawn(level, this.state, world.platforms);
    this.registerCombat(player, enemies);

    this.cameras.main.setBounds(0, 0, level.width, level.height);
    this.cameras.main.centerOn(level.playerSpawn.x, level.playerSpawn.y);
  }

  private teardownLevel(): void {
    for (const collider of this.colliders) {
      collider.destroy();
    }
    this.colliders = [];
    this.enemies?.clear();
    this.shieldView?.destroy();
    this.shieldView = undefined;

    if (!this.world) {
      return;
    }
    for (const object of this.world.scenery) {
      this.tweens.killTweensOf(object);
      object.destroy();
    }
    this.world.platforms.clear(true, true);
    this.world.platforms.destroy();
    this.world = undefined;
  }

  private registerCombat(
    player: Phaser.Physics.Arcade.Sprite,
    enemies: EnemyDirector,
  ): void {
    this.colliders.push(
      this.physics.add.overlap(player, enemies.bullets, (_, bulletObject) => {
        (bulletObject as Phaser.Physics.Arcade.Sprite).destroy();
        if (this.time.now < this.state.player.shieldUntil) {
          this.state.player.message = "Web shield caught the shot.";
          return;
        }
        damagePlayer(this.state, 12, "Hit by a skyline shot.");
      }),
    );

    for (const enemy of enemies.all) {
      this.colliders.push(
        this.physics.add.overlap(player, enemy.sprite, () => {
          if (
            this.time.now < this.hitCooldownUntil ||
            this.time.now < enemy.snaredUntil
          ) {
            return;
          }
          this.hitCooldownUntil = this.time.now + HIT_COOLDOWN;
          damagePlayer(this.state, enemy.state.damage, contactMessage(enemy));
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
        webs.release(cut, handPosition(player, cut));
      } else {
        webs.clearLine();
      }
      return;
    }

    webs.drawLine(anchor, handPosition(player, anchor));
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
      player.anims.stop();
      player.setTexture(artKeys.hero.swing);
      return;
    }

    if (mode === "airborne" && actions.glide) {
      player.anims.stop();
      player.setTexture(artKeys.hero.glide);
      return;
    }

    if (mode === "grounded" && Math.abs(velocityX) > 60) {
      player.play("player-run", true);
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

      enemy.sprite.setVelocityX(facing * 240);
      enemy.sprite.setTint(0xffffff);
      this.time.delayedCall(90, () => {
        if (enemy.sprite.active) {
          enemy.sprite.clearTint();
        }
      });

      if (damageEnemy(this.state, enemy.state, 20)) {
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
    const enemies = this.enemies;
    if (!enemies) {
      return;
    }

    const projectile = this.physics.add.sprite(
      x,
      y,
      power === "net" ? "webNet" : "webGlob",
    );
    projectile.body.setAllowGravity(false);
    projectile.setDepth(9);
    projectile.setVelocity(
      facing * (power === "net" ? 430 : 560),
      power === "net" ? -20 : 0,
    );

    for (const enemy of enemies.all) {
      this.physics.add.overlap(projectile, enemy.sprite, () => {
        if (!projectile.active) {
          return;
        }
        projectile.destroy();
        if (power === "net") {
          enemies.snare(enemy);
        }
        if (damageEnemy(this.state, enemy.state, power === "net" ? 12 : 16)) {
          enemies.defeat(enemy);
        }
      });
    }

    this.time.delayedCall(1100, () => projectile.destroy());
  }

  private cycleGadget(): void {
    const next =
      (GADGETS.indexOf(this.state.player.gadget) + 1) % GADGETS.length;
    this.state.player.gadget = GADGETS[next];
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
      this.state.player.message = "Web net launched.";
      return;
    }

    if (this.state.player.gadget === "web-shield") {
      this.state.player.shieldUntil = time + 1100;
      this.createWebBurst(player.x, player.y, 58, 760);
      this.state.player.message = "Web shield spun.";
      return;
    }

    player.setVelocityY(-420);
    this.createWebBurst(player.x - facing * 22, player.y + 8, 42, 520);
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
    const burst = this.add.graphics().setDepth(9);
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

    this.tweens.add({
      targets: burst,
      alpha: 0,
      scale: 1.18,
      duration,
      ease: "Sine.out",
      onComplete: () => burst.destroy(),
    });
  }

  private knockOut(player: Phaser.Physics.Arcade.Sprite): void {
    this.state.progression.status = "knockedOut";
    this.state.player.message = "You were knocked out. Press R to restart.";
    this.webs?.clearLine();
    player.setVelocity(0, 0);
    player.anims.stop();
    player.setTexture(artKeys.hero.glide);
    player.setAngle(90);
    player.setTint(0xffd1f0);
    this.cameras.main.shake(360, 0.006);
  }

  private createAnimations(): void {
    const definitions = [
      { key: "player-idle", frames: artKeys.hero.idle, frameRate: 4 },
      { key: "player-run", frames: artKeys.hero.run, frameRate: 9 },
      { key: "robot-walk", frames: artKeys.robot, frameRate: 5 },
      { key: "gunner-walk", frames: artKeys.enforcer, frameRate: 4 },
      { key: "drone-fly", frames: artKeys.drone, frameRate: 10 },
    ];

    for (const definition of definitions) {
      this.anims.remove(definition.key);
      this.anims.create({
        key: definition.key,
        frames: definition.frames.map((key) => ({ key })),
        frameRate: definition.frameRate,
        repeat: -1,
      });
    }
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

  private requireController(): PlayerController {
    if (!this.controller) {
      throw new Error("Player controller has not been created.");
    }
    return this.controller;
  }
}

const handPosition = (
  player: Phaser.Physics.Arcade.Sprite,
  anchor: Vec2,
): Vec2 => ({
  x: player.x + (anchor.x < player.x ? -18 : 18),
  y: player.y - 48,
});

const contactMessage = (enemy: EnemyView): string => {
  if (enemy.state.kind === "gunner") {
    return "Close-range blast.";
  }
  return enemy.state.kind === "drone" ? "Drone zap." : "Robot tackle.";
};
