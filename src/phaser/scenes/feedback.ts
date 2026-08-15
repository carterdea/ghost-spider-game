import type Phaser from "phaser";
import type { GameAudio } from "../../audio";
import { clamp, type Vec2 } from "../../game/simulation/physics/vector";
import type { EnemyState, GameState } from "../../game/simulation/state";
import {
  breakCombo,
  type ComboState,
  createCombo,
  damageEnemy,
} from "../../game/simulation/systems/combat";
import type { PlayerMode } from "../actors/PlayerController";
import { HeroTilt } from "../fx/HeroTilt";
import { Impact } from "../fx/Impact";
import { Particles } from "../fx/Particles";

/**
 * Everything a blow, a landing or a fall reports back to the player: the freeze,
 * the kick, the dust, the sparks, the lean and the sound they arrive with.
 *
 * It exists so `GameScene` can stay an orchestrator. A hit is one event, and
 * the six ways the game says so are tuned together here rather than scattered
 * across the callbacks that happen to fire them.
 */

/** How a blow was delivered. A fist lands heavier than a web glob. */
export type StrikeKind = "melee" | "shot";

/** Weight of a blow, 0 to 1, by how it was thrown and whether it finished. */
interface Weights {
  hit: number;
  kill: number;
}

const IMPACT_WEIGHT: Record<StrikeKind, Weights> = {
  melee: { hit: 0.45, kill: 1 },
  shot: { hit: 0.3, kill: 0.85 },
};

const SPARK_WEIGHT: Record<StrikeKind, Weights> = {
  melee: { hit: 0.5, kill: 1 },
  shot: { hit: 0.4, kill: 0.9 },
};

const weigh = (weights: Weights, defeated: boolean): number =>
  defeated ? weights.kill : weights.hit;

/** Particles sit above the hero (8) and below the web lines (20). */
const PARTICLE_DEPTH = 11;

/**
 * Downward speed, in px/s, under which an arrival is a step down rather than a
 * landing. Resting contact already reports 0, so this only filters kerb-height
 * drops — everything above it gets the full report.
 */
const LANDING_FLOOR = 260;

/** Downward speed that reads as a landing that hurt. */
const LANDING_RANGE = 900;

/** A landing shakes the camera less than a blow of the same weight. */
const LANDING_SHAKE = 0.6;

/** The hero's feet, in pixels below the sprite's centre. */
const FEET_OFFSET = 96;

/** Camera kick for a hit the hero took. */
const HURT_SHAKE = 0.5;

/** Longest chain the combo sound climbs for, matching the multiplier's cap. */
const COMBO_TOP = 7;

export class RunFeedback {
  /** The chain currently running. The HUD reads it; combat extends it. */
  public readonly combo: ComboState = createCombo();

  private readonly impact: Impact;
  private readonly particles: Particles;
  private readonly tilt: HeroTilt;
  private readonly hero: Phaser.Physics.Arcade.Sprite;
  private readonly world: Phaser.Physics.Arcade.World;
  private readonly tweens: Phaser.Tweens.TweenManager;
  private readonly audio?: GameAudio;
  /** What the tween manager was last told, so a hold is applied on its edge. */
  private tweensHeld = false;

  public constructor(
    scene: Phaser.Scene,
    hero: Phaser.Physics.Arcade.Sprite,
    audio?: GameAudio,
  ) {
    this.impact = new Impact(scene);
    this.particles = new Particles(scene, PARTICLE_DEPTH);
    this.tilt = new HeroTilt(hero);
    this.hero = hero;
    this.world = scene.physics.world;
    this.tweens = scene.tweens;
    this.audio = audio;
  }

  /**
   * Run once per frame with the scene's delta. Returns the delta the simulation
   * should step, which is where the hit-stop lives.
   *
   * Arcade integrates a body's velocity over real time, so a smaller sim delta
   * does not slow the hero down on its own: the controller divides the shorter
   * step straight back out and hands Phaser the same velocity. Holding the
   * physics world is what actually stops the world. It is driven from `frozen`
   * every frame, so a freeze can only ever last as long as `Impact` says, and
   * pausing — rather than scaling `world.timeScale` — is what keeps Arcade from
   * banking the skipped time and spending it all on the frame the freeze lifts.
   *
   * `held` is the run not being played — a pause, the title, either way it
   * ends. It shares `world.isPaused` with the hit-stop, and `holdWorld` is the
   * only place either of them writes it.
   */
  public step(deltaMs: number, held = false): number {
    const simDelta = this.impact.step(deltaMs);
    this.holdWorld(held);
    this.holdTweens(held);
    this.particles.update(held ? 0 : simDelta);
    return simDelta;
  }

  /**
   * Whether Arcade may step, recomputed from both the things that stop it: the
   * world runs when neither the run nor a freeze wants it held. Nothing
   * latches, so lifting a pause over a live freeze leaves the freeze holding
   * the world, and a freeze that expires under a pause changes nothing — the
   * two can never strand each other.
   *
   * Callable on its own because Arcade steps the world *before* the scene
   * updates: a freeze asked for during that update — a landed fist, a gadget —
   * or a run that ended inside it has already missed `step`, and would not
   * reach the world until the frame after next.
   */
  public holdWorld(held: boolean): void {
    this.world.isPaused = held || this.impact.frozen;
  }

  /**
   * Tweens do not stop with the physics world, and the level's moving platforms
   * are tween-driven and carry whatever is standing on them. Left running, a
   * pause taken on a rising hoist would keep hauling the hero up the district
   * while the game claimed to be stopped.
   *
   * Only the pause holds them, not the hit-stop: a freeze is tens of
   * milliseconds and pausing the manager mid-blow would stall the very tweens
   * the blow started. Applied on the edge, since `pauseAll` walks every tween.
   */
  private holdTweens(held: boolean): void {
    if (held === this.tweensHeld) {
      return;
    }
    this.tweensHeld = held;
    if (held) {
      this.tweens.pauseAll();
    } else {
      this.tweens.resumeAll();
    }
  }

  /** Leans the hero into the direction of travel. Presentation only. */
  public lean(mode: PlayerMode, velocityX: number, simDelta: number): void {
    this.tilt.update(mode, velocityX, simDelta);
  }

  /**
   * The floor took `impactSpeed` px/s off the hero. One arrival, one report:
   * the thump, the dust and the kick are all sized from it, and it ends any
   * chain that was running — a chain is a run of takedowns kept in the air.
   */
  public land(impactSpeed: number, grounded: boolean): void {
    const arrived = impactSpeed > LANDING_FLOOR;
    // Standing on something ends a chain whether or not the arrival was hard
    // enough to be worth reporting. A chain is a run of takedowns kept in the
    // air, and a hero strolling between two street-level enemies is keeping
    // nothing in the air — without this they bank the airborne multiplier and
    // its healing on foot, indefinitely.
    if (grounded || arrived) {
      breakCombo(this.combo);
    }
    if (!arrived) {
      return;
    }

    const power = clamp(impactSpeed / LANDING_RANGE, 0, 1);
    this.audio?.play("land", power);
    this.particles.dust(this.hero.x, this.hero.y + FEET_OFFSET, power);
    this.impact.shake(power * LANDING_SHAKE);
  }

  /**
   * A blow the hero landed, applied and reported in one go. `at` is where the
   * sparks fly from — the enemy for a punch, the projectile for a web shot.
   * Returns whether it was the killing blow.
   */
  public damage(
    state: GameState,
    enemy: EnemyState,
    amount: number,
    kind: StrikeKind,
    victim: Phaser.GameObjects.Sprite,
    at: Vec2,
  ): boolean {
    const chain = this.combo.count;
    const defeated = damageEnemy(state, enemy, amount, this.combo);

    this.impact.strike(weigh(IMPACT_WEIGHT[kind], defeated), victim);
    this.particles.spark(at.x, at.y, weigh(SPARK_WEIGHT[kind], defeated));
    this.audio?.play(defeated ? "enemyDefeated" : "enemyHit");

    // The chain sound walks up the scale, so a long run is audible as one.
    if (this.combo.count > chain) {
      this.audio?.play("comboUp", clamp(this.combo.count / COMBO_TOP, 0, 1));
    }
    return defeated;
  }

  /** A blow the hero took. */
  public hurt(): void {
    this.impact.shake(HURT_SHAKE);
    this.impact.flash(this.hero);
  }

  /**
   * Drops every live effect. Called when a level is torn down and when the run
   * ends, so nothing that was mid-flash writes over the pose that follows it.
   *
   * The world is released because the freeze this owned is gone. A pause is not
   * this object's to hold, and the next `step` re-derives the world from it.
   */
  public reset(): void {
    this.impact.reset();
    this.particles.reset();
    this.tilt.reset();
    this.world.isPaused = false;
    this.holdTweens(false);
    breakCombo(this.combo);
  }

  public destroy(): void {
    this.particles.destroy();
  }
}
