import Phaser from "phaser";
import { createAudio, type GameAudio } from "../../audio";
import { artKeys, preloadArt } from "../../game/assets/manifest";
import { LEVELS, type LevelDefinition } from "../../game/content/levels";
import {
  type ActionState,
  createEmptyActions,
  pressedSlot,
  readActions,
} from "../../game/input/actions";
import {
  createKeyboardBindings,
  createSlotBindings,
} from "../../game/input/bindings";
import type { Vec2 } from "../../game/simulation/physics/vector";
import { clamp } from "../../game/simulation/physics/vector";
import {
  createInitialGameState,
  enterLevel,
  type GameState,
  startRun,
  togglePause,
} from "../../game/simulation/state";
import {
  getLevelByIndex,
  isFinalLevelIndex,
  isGoalReached,
  syncLevelProgress,
  tickRunClock,
} from "../../game/simulation/systems/progression";
import { Hud } from "../../ui/hud/hud";
import { createCharacterAnimations } from "../actors/animations";
import { EnemyDirector } from "../actors/EnemyDirector";
import {
  PlayerController,
  type PlayerMode,
  type PlayerStep,
} from "../actors/PlayerController";
import { applyBodyBox, BODY_BOXES } from "../actors/placement";
import { type WeaponClock, WeaponRack } from "../actors/WeaponRack";
import { WebRenderer } from "../fx/WebRenderer";
import { LevelBuilder } from "../world/LevelBuilder";
import type { LevelWorld } from "../world/LevelWorld";
import { createPropTextures } from "../world/textures";
import { frameZoom } from "../world/viewport";
import { bossSound, bossSpawnFor } from "./bossBinding";
import { registerCombat } from "./combatColliders";
import { RunFeedback } from "./feedback";
import { syncRunMusic } from "./runMusic";

const ATTACK_COOLDOWN = 280;
const STRIKE_RANGE = 96;

/**
 * A strike lands from inside the enemy's own reach; a glob is thrown from
 * anywhere. Paying them 20 and 16 asked the player to close for a fifth more
 * damage, so the honest answer was always to stand off and throw — and the
 * boss fight in particular read as kiting rather than as diving into the
 * opening its recovery window exists to offer. Closing is the risk, so it is
 * where the damage lives.
 */
const STRIKE_DAMAGE = 34;

/**
 * Where a landed fist throws its target. The lift is what makes the shove
 * legible: a target left on the floor is scrubbed off by the very next step of
 * gravity and separation, and reads as a hit that pushed nothing.
 */
const STRIKE_KNOCKBACK = (facing: number): Vec2 => ({
  x: facing * 240,
  y: -140,
});

/** How long that throw overrides the target's own brain. */
const STRIKE_HOLD_MS = 220;

/**
 * How far the camera eases out of its resting frame as the hero picks up speed,
 * so fast swings read wider. Factors on the framing zoom rather than zooms in
 * their own right: the window decides the frame, this decides how much of it a
 * fast hero is given — see `frameZoom`.
 */
const EASE_RESTING = 1;
const EASE_FAST = 0.82;
const ZOOM_SPEED_RANGE = 900;

/** Speed that maps to a full-intensity swing whoosh: the swing solver's cap. */
const SWING_SOUND_RANGE = 1250;
/** Speed that maps to a full wind bed. */
const WIND_SPEED_RANGE = 1000;

export class GameScene extends Phaser.Scene {
  private state: GameState = createInitialGameState(LEVELS[0], "title");
  private hud?: Hud;
  private keys?: ReturnType<typeof createKeyboardBindings>;
  private slots?: ReturnType<typeof createSlotBindings>;
  /** The slot held last frame, so holding a number key selects once. */
  private previousSlot?: number;
  private previousActions: ActionState = createEmptyActions();

  private player?: Phaser.Physics.Arcade.Sprite;
  private controller?: PlayerController;
  private builder?: LevelBuilder;
  private enemies?: EnemyDirector;
  private webs?: WebRenderer;
  private projectiles?: Phaser.Physics.Arcade.Group;
  private world?: LevelWorld;
  private feedback?: RunFeedback;
  private rack?: WeaponRack;

  private audio?: GameAudio;
  /** Last frame's position, so a fast swing cannot tunnel through the goal. */
  private lastPlayerPosition: Vec2 = { x: 0, y: 0 };

  private attackCooldownUntil = 0;
  private shieldView?: Phaser.GameObjects.Arc;
  /** Where the speed ease currently sits, so a resize can reframe around it. */
  private zoomEase = EASE_RESTING;

  public constructor() {
    super("game");
  }

  public preload(): void {
    for (const asset of preloadArt) {
      this.load.image(asset.key, asset.path);
    }
  }

  public create(): void {
    // A run opens on the title, not mid-swing: the world is built and the level
    // is loaded behind the panel, so the first press drops straight into play.
    this.state = createInitialGameState(LEVELS[0], "title");
    this.setUpAudio();
    this.syncMusic();

    // The window is the viewport, so every resize is a reframe. Phaser resizes
    // the camera itself; what it cannot know is how much world the new shape
    // should be holding.
    this.scale.on(Phaser.Scale.Events.RESIZE, this.reframe);

    // Registered before anything it owns exists: Phaser's own groups tear
    // themselves down on this event in creation order, and a group destroyed
    // out from under `EnemyDirector.destroy()` throws mid-shutdown and leaves
    // the restart half-finished.
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      // The scale manager outlives the scene: an un-removed handler would
      // reframe a camera the next boot has already replaced.
      this.scale.off(Phaser.Scale.Events.RESIZE, this.reframe);
      this.enemies?.destroy();
      this.webs?.destroy();
      this.feedback?.destroy();
      this.rack?.destroy();
      this.audio?.setWind(0);
      // Phaser has already taken the level's groups, tweens and timers. Let
      // the handle go rather than leaving the next boot to tear down corpses.
      this.world = undefined;
    });

    createPropTextures(this);
    createCharacterAnimations(this);

    this.projectiles = this.physics.add.group({ allowGravity: false });
    this.builder = new LevelBuilder(this);
    const enemies = new EnemyDirector(
      this,
      () => this.audio?.play("enemyShot"),
      (event) => this.audio?.play(bossSound(event)),
    );
    this.enemies = enemies;
    this.webs = new WebRenderer(this);

    const player = this.physics.add.sprite(0, 0, artKeys.hero.idle[0]);
    player.setCollideWorldBounds(true);
    player.setDepth(8);
    applyBodyBox(player, BODY_BOXES.hero);
    player.play("player-idle");
    this.player = player;
    this.controller = new PlayerController(player);
    const feedback = new RunFeedback(this, player, this.audio);
    this.feedback = feedback;
    this.rack = new WeaponRack({
      scene: this,
      state: this.state,
      enemies,
      feedback,
      controller: this.controller,
      play: (event) => this.audio?.play(event),
    });

    this.cameras.main.startFollow(player, true, 0.09, 0.09);
    this.cameras.main.setDeadzone(180, 130);

    this.loadLevel(getLevelByIndex(0));

    const hudRoot = document.getElementById("hud");
    if (!hudRoot) {
      throw new Error("Missing HUD root.");
    }
    this.hud = new Hud(hudRoot);
    this.keys = createKeyboardBindings(this);
    this.slots = createSlotBindings(this);
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
      this.rack?.ammo.charges,
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
  }

  /**
   * M. Read as an action on the edge of the press rather than answered with a
   * raw `keydown-M`, which the OS repeats while the key is held: each repeat
   * wrote `localStorage` and restarted the sequencer, and the run ended up
   * muted or not by the parity of however many arrived.
   */
  private toggleMute(): void {
    const audio = this.audio;
    if (!audio) {
      return;
    }
    audio.setMuted(!audio.isMuted());
    this.state.player.message = audio.isMuted() ? "Sound off." : "Sound on.";
  }

  public update(time: number, delta: number): void {
    const actions = this.keys ? readActions(this.keys) : createEmptyActions();

    if (this.wasPressed(actions, "reset")) {
      this.previousActions = actions;
      this.audio?.setWind(0);
      this.audio?.music.setIdle();
      // The run's last word is a cue, and a cue is scheduled ahead of itself:
      // restarting during the knocked-out sting left ~3s of it ringing over the
      // title. `setIdle` decides what plays next; this ends what is still
      // playing. A pause deliberately does neither — it ducks to the bed and
      // keeps the arrangement's place.
      this.audio?.music.silence();
      this.scene.restart();
      return;
    }

    // Every status can be muted, so this is read before the run is.
    if (this.wasPressed(actions, "mute")) {
      this.toggleMute();
    }

    // Space is both the start prompt and the jump, so the press that lifts the
    // title is spent here rather than launching the hero on their first frame.
    if (this.wasPressed(actions, "start") && this.beginRun()) {
      this.previousActions = actions;
      this.renderHud();
      return;
    }
    if (this.wasPressed(actions, "pause")) {
      this.setPaused();
    }

    const playing = this.playing;
    tickRunClock(this.state, delta);

    // The world runs slow for a beat after a blow lands, and stops dead while
    // the run is not being played. Both are the same physics flag, so both go
    // through the one call that owns it — see `RunFeedback.holdWorld`.
    //
    // Every non-playing status holds it, not only a pause: the title builds its
    // district behind the panel, and a run that has ended still had bullets in
    // the air, which went on flying and hitting long after the final goal was
    // touched because nothing was left running to cull them.
    const simDelta = this.feedback?.step(delta, !playing) ?? delta;

    if (playing) {
      this.updateRun(actions, time, simDelta);
      this.webs?.update();
    } else {
      this.player?.setVelocity(0, 0);
    }

    // Re-derived once the run has had its frame. `updateRun` can end the run —
    // and `knockOut` explicitly releases the world when it drops its effects —
    // while a blow landed inside it asks for a freeze `step` has already run
    // past. Arcade steps the world before the scene updates, so a hold written
    // here is the earliest one the next step can see.
    this.feedback?.holdWorld(!this.playing);
    // The level's timers run on the scene clock, which a pause does not stop.
    this.world?.hold(!this.playing);

    this.renderHud();
    this.previousActions = actions;
  }

  /** Only a live run simulates, and only a live run takes damage. */
  private get playing(): boolean {
    return this.state.progression.status === "playing";
  }

  /**
   * The start prompt. The level is already built, so this only lifts the panel
   * and hands the score its district. Returns whether it started anything.
   */
  private beginRun(): boolean {
    if (!startRun(this.state)) {
      return false;
    }
    this.syncMusic();
    return true;
  }

  /** Escape or P. A title or a finished run has no world to hold. */
  private setPaused(): void {
    const before = this.state.progression.status;
    if (togglePause(this.state) !== before) {
      this.syncMusic();
    }
  }

  /** The score follows the run's status. The table lives in `runMusic`. */
  private syncMusic(): void {
    const audio = this.audio;
    if (audio) {
      syncRunMusic(
        audio,
        this.state.progression.status,
        this.state.progression.levelIndex,
      );
    }
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
    this.renderWeb(player, step, controller.isLaunching);
    this.animatePlayer(player, actions, step.mode);
    this.feedback?.lean(step.mode, player.body?.velocity.x ?? 0, delta);
    this.feedback?.land(step.landingImpact, step.mode === "grounded");
    this.playMotionSounds(
      step,
      controller,
      1 - clamp(player.y / level.height, 0, 1),
    );

    this.rack?.update(this.weaponClock(time));
    // Read on the press edge, so holding a number key equips once rather than
    // re-equipping — and saying "ready" — on every frame it stays down.
    const slot = this.slots ? pressedSlot(this.slots) : undefined;
    if (slot !== undefined && slot !== this.previousSlot) {
      this.rack?.select(slot);
      this.audio?.play("gadgetCycle");
    }
    this.previousSlot = slot;
    if (this.wasPressed(actions, "cycleGadget")) {
      this.rack?.cycle();
      this.audio?.play("gadgetCycle");
    }
    if (
      this.wasPressed(actions, "attack") &&
      this.state.progression.elapsedMs >= this.attackCooldownUntil
    ) {
      this.attack(player, this.state.progression.elapsedMs);
    }
    if (this.wasPressed(actions, "gadget")) {
      // The rack owns its own ammo and shared cooldown, so the scene no longer
      // gates this: an empty slot has to reach `use` to say it is empty.
      this.rack?.use(player, this.weaponClock(time));
    }

    this.enemies?.update(delta, player);
    // The run clock, the same one the shield was stamped against: on the
    // scene's the ring outlived a pause the shield itself had not.
    this.updateShield(player, this.state.progression.elapsedMs);
    this.updateCameraZoom(level, controller.speed, delta);

    if (this.state.player.health === 0) {
      this.knockOut(player);
      return;
    }

    this.checkProgress(player);
  }

  /**
   * The clocks the arsenal is timed against. The scene's own keeps running
   * through a pause — only the run clock is stopped by one — so anything the
   * hero has to wait for reads that instead. `tickRunClock` has already banked
   * this frame by the time anything asks.
   */
  private weaponClock(sceneNow: number): WeaponClock {
    return { scene: sceneNow, run: this.state.progression.elapsedMs };
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
      // `syncLevelProgress` already marked the run cleared and paid for it.
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
    this.resetTransientState(level);

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
    registerCombat({
      scene: this,
      state: this.state,
      player,
      enemies,
      world,
      projectiles: this.requireProjectiles(),
      feedback: this.requireFeedback(),
      webs: this.webs,
      controller: this.controller,
      audio: this.audio,
      isPlaying: () => this.playing,
    });
    // After the spawns for the same reason `registerCombat` is: the rack
    // registers a shot and a charge overlap per enemy, boss included.
    this.rack?.beginLevel(world);
    // Webbing picks up the district's colour, so the line belongs to the place
    // it is strung across rather than sitting over it.
    this.webs?.setAccent(level.accent);

    this.cameras.main.setBounds(0, 0, level.width, level.height);
    this.cameras.main.centerOn(level.playerSpawn.x, level.playerSpawn.y);
  }

  /** Cooldowns and camera framing belong to the run, not to the next level. */
  private resetTransientState(level: LevelDefinition): void {
    this.attackCooldownUntil = 0;
    this.zoomEase = EASE_RESTING;
    this.cameras.main.setZoom(
      frameZoom(this.scale.gameSize, level, EASE_RESTING),
    );
  }

  private teardownLevel(): void {
    this.enemies?.clear();
    this.rack?.clear();
    this.projectiles?.clear(true, true);
    this.shieldView?.destroy();
    this.shieldView = undefined;
    this.webs?.reset();
    this.feedback?.reset();
    this.world?.destroy();
    this.world = undefined;
  }

  /**
   * `fromSurface` separates a launch off a rooftop from a snatch in open air:
   * a full knot flare on every re-catch turns one arc into a string of flashes.
   *
   * The rope is measured from the hero's centre rather than the fist, because
   * that is where the solver measures it — from the fist the line carries about
   * ten pixels of phantom slack and never draws taut.
   */
  private renderWeb(
    player: Phaser.Physics.Arcade.Sprite,
    step: PlayerStep,
    fromSurface: boolean,
  ): void {
    const webs = this.webs;
    if (!webs) {
      return;
    }

    const rope = step.rope;
    if (!rope) {
      const cut = step.released ? this.controller?.releasedAnchor : undefined;
      if (cut) {
        webs.release(cut, handPosition(player));
      } else {
        webs.clearLine();
      }
      return;
    }

    const hand = handPosition(player);
    if (step.attached) {
      webs.launch(rope.anchor, hand, fromSurface);
    }
    webs.drawLine(rope.anchor, hand, rope.length, player);
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

  private updateCameraZoom(
    level: LevelDefinition,
    speed: number,
    delta: number,
  ): void {
    this.zoomEase = Phaser.Math.Linear(
      EASE_RESTING,
      EASE_FAST,
      clamp(speed / ZOOM_SPEED_RANGE, 0, 1),
    );
    const camera = this.cameras.main;
    camera.setZoom(
      Phaser.Math.Linear(
        camera.zoom,
        frameZoom(this.scale.gameSize, level, this.zoomEase),
        Math.min(1, delta / 260),
      ),
    );
  }

  /**
   * Snaps the frame to the window it now has. Not eased: a resize is already a
   * jolt, and easing out of it would read as the camera lurching afterwards.
   */
  private readonly reframe = (): void => {
    const level = getLevelByIndex(this.state.progression.levelIndex);
    this.cameras.main.setZoom(
      frameZoom(this.scale.gameSize, level, this.zoomEase),
    );
  };

  /**
   * `time` is the run clock, not the scene's. Held on wall time the swing
   * recharged through a pause, and the boss fight came apart: strike inside a
   * punish window, pause out the 280ms, resume and strike again, over and over
   * without ever spending the window the whole fight is measured in.
   */
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
      // Through the director, not straight onto the body: `enemies.update` runs
      // later in this same frame and rewrites the velocity from the brain's
      // intent, with no physics step in between, so a plain `setVelocityX` was
      // invisible on anything the blow did not finish. `launch` is what holds
      // the brain off the body until the throw is spent.
      this.enemies?.launch(enemy, STRIKE_KNOCKBACK(facing), STRIKE_HOLD_MS);

      const defeated = this.requireFeedback().damage(
        this.state,
        enemy.state,
        STRIKE_DAMAGE,
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
