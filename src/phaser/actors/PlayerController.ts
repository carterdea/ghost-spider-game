import type Phaser from "phaser";
import type { AnchorPoint } from "../../game/content/levels";
import type { ActionState } from "../../game/input/actions";
import {
  chooseAttachment,
  DEFAULT_ATTACHMENT_TUNING,
} from "../../game/simulation/physics/attachment";
import {
  createLocomotionMemory,
  DEFAULT_LOCOMOTION_TUNING,
  type LocomotionMemory,
  stepLocomotion,
} from "../../game/simulation/physics/locomotion";
import {
  DEFAULT_SWING_TUNING,
  type Rope,
  type SwingTuning,
  stepSwing,
} from "../../game/simulation/physics/swing";
import type { Vec2 } from "../../game/simulation/physics/vector";
import { feetOffset, standOn } from "./placement";

export type PlayerMode = "grounded" | "airborne" | "swinging";

export interface PlayerStep {
  mode: PlayerMode;
  rope?: Rope;
  /** True on the frame a web caught, for sound and camera punch. */
  attached: boolean;
  /** True on the frame a web released, for the slingshot flourish. */
  released: boolean;
  jumped: boolean;
  /**
   * Downward speed the floor took off the hero this frame, in px/s, and 0 on
   * every frame that is not a landing. Resting contact reads 0: the solver
   * zeroes the fall itself while grounded, so only a real arrival has anything
   * left to absorb. Scale dust, shake and the landing thump by it.
   */
  landingImpact: number;
}

/** A frame longer than this is a stall (tab switch); clamp so the sim never leaps. */
const MAX_SIM_SECONDS = 1 / 20;

/**
 * Outer guard on the transport velocity. The solver never asks to travel faster
 * than its own `maxSpeed`, so anything approaching this is a bad timestep rather
 * than real motion. Arcade gets the same number as the body's max velocity:
 * `Number.MAX_SAFE_INTEGER` disabled the engine's last line of defence, so one
 * poisoned frame could fling the hero out of the level.
 */
export const MAX_TRANSPORT_SPEED = 2400;

/**
 * Sim time and transport time for one frame.
 *
 * `sim` is clamped so a stalled tab cannot make the solver leap. `transport` is
 * the real elapsed time, because that is the window Arcade integrates our
 * velocity over: after a 300ms stall, dividing the displacement by the clamped
 * 50ms would carry the body six times further than the sim ever asked for.
 */
interface FrameTime {
  sim: number;
  transport: number;
}

const frameTimeFor = (deltaMs: number): FrameTime | undefined => {
  const seconds = deltaMs / 1000;
  // `NaN <= 0` is false, so a bare `<= 0` guard let a poisoned delta straight
  // through and every downstream number became NaN.
  if (!Number.isFinite(seconds) || seconds <= 0) {
    return undefined;
  }
  return { sim: Math.min(seconds, MAX_SIM_SECONDS), transport: seconds };
};

/** Velocity that carries the body across `offset` in `seconds`, speed-capped. */
const transportVelocity = (offset: Vec2, seconds: number): Vec2 => {
  const x = offset.x / seconds;
  const y = offset.y / seconds;
  const speed = Math.hypot(x, y);
  if (speed <= MAX_TRANSPORT_SPEED) {
    return { x, y };
  }

  // The rope's positional correction is not speed-limited, so a violent solve
  // can out-run `maxSpeed`. Trim it rather than hand Arcade a teleport.
  const trim = MAX_TRANSPORT_SPEED / speed;
  return { x: x * trim, y: y * trim };
};

/**
 * Downward velocity kept while standing. Arcade needs a little push each frame
 * to keep reporting contact, but letting the sim's gravity accumulate makes
 * `blocked.down` stutter and jumps drop inputs.
 */
const GROUND_STICK = 40;

/**
 * Resting contact makes Arcade report `blocked.down` only on the frames it
 * actually separates the body, so raw reads can flicker the run animation off
 * for a frame. Latching it briefly keeps the animation steady.
 *
 * Presentation only. The solver must never see the latched value: locomotion
 * refreshes its own coyote timer on every grounded substep, so a latch here
 * silently added its own duration to coyote time (90 + 120 = 210ms) and left the
 * hero hovering on GROUND_STICK for 90ms after walking off a ledge.
 */
const GROUND_LATCH_MS = 90;

/**
 * How far above its floor a catch still counts as a launch.
 *
 * A pendulum bottoms out at `anchor.y + length`, so a rope longer than the
 * anchor stands above the *floor the hero is on* drives them straight into it.
 * The attachment solver already enforces that rule, but only ever against the
 * pavement — from a rooftop the pavement is hundreds of pixels too low and the
 * check passes on an arc that goes clean through the roof. Above this height
 * the hero is over open air and the pavement is the only floor left.
 */
const LAUNCH_BAND = 300;

/**
 * Speed of the shove along the web line when a launch needs to clear its floor.
 * Along the line rather than straight up: a vertical kick is mostly *tangential*
 * to the rope, which swings the hero backwards, while a kick down the line is
 * purely radial, so the rope goes slack and the launch is a clean leap.
 */
const LAUNCH_SPEED = 340;

/** Web swings are the fastest thing in the game, but not so fast they outrun the camera. */
const SWING_TUNING = { ...DEFAULT_SWING_TUNING, maxSpeed: 1250 };

/**
 * Held while a launch is still hauling its rope in to a length whose arc clears
 * the floor. The swing reel is paced for steering mid-flight; a launch has to
 * beat gravity off a rooftop, so it pulls hand over hand instead.
 */
const LAUNCH_TUNING = { ...SWING_TUNING, reelSpeed: 560 };

const ATTACHMENT_TUNING = {
  ...DEFAULT_ATTACHMENT_TUNING,
  minRopeLength: SWING_TUNING.minRopeLength,
  maxRopeLength: SWING_TUNING.maxRopeLength,
};

/**
 * Bridges the pure physics modules to a Phaser arcade body.
 *
 * The sim owns velocity; Phaser owns collision. Each frame we seed the sim from
 * the sprite's real position (so collision separation feeds back in), step the
 * pure solver, then hand Phaser the *transport* velocity that lands the body
 * exactly where the sim says. Phaser's gravity and drag stay off — the sim
 * already applies both, and doubling them was one of the old scene's bugs.
 */
export class PlayerController {
  private readonly sprite: Phaser.Physics.Arcade.Sprite;
  private velocity: Vec2 = { x: 0, y: 0 };
  private memory: LocomotionMemory = createLocomotionMemory();
  private rope?: Rope;
  private lastAnchor?: Vec2;
  private targetLength = 0;
  private lastGroundedAt = Number.NEGATIVE_INFINITY;
  /** Feet line of the surface the hero last stood on: the floor a launch clears. */
  private lastSurfaceY?: number;
  /** True while a catch is still reeling itself up to a floor-clearing radius. */
  private launching = false;

  public constructor(sprite: Phaser.Physics.Arcade.Sprite) {
    this.sprite = sprite;
    const body = sprite.body as Phaser.Physics.Arcade.Body;
    body.setAllowGravity(false);
    body.setAllowDrag(false);
    sprite.setMaxVelocity(MAX_TRANSPORT_SPEED);
  }

  public get isSwinging(): boolean {
    return this.rope !== undefined;
  }

  public get currentRope(): Rope | undefined {
    return this.rope;
  }

  /**
   * True while a catch made over a floor is still hauling its rope in to a
   * radius that clears it. It is the one thing that already separates a launch
   * off a rooftop from a catch made in open air, which is what the scene needs
   * to tell the two web sounds apart.
   */
  public get isLaunching(): boolean {
    return this.launching;
  }

  public get speed(): number {
    return Math.hypot(this.velocity.x, this.velocity.y);
  }

  /** `ground` is a standing position: the hero's feet land on it. */
  public reset(ground: Vec2): void {
    standOn(this.sprite, ground.x, ground.y);
    this.velocity = { x: 0, y: 0 };
    this.memory = createLocomotionMemory();
    this.rope = undefined;
    // Leaving these behind let `releasedAnchor` draw a web to the anchor the
    // hero was holding when they died, one level after the fact.
    this.lastAnchor = undefined;
    this.targetLength = 0;
    this.lastGroundedAt = Number.NEGATIVE_INFINITY;
    // A spawn is a standing position, so it is already a known floor: levels
    // drop the hero a little way onto their roof, and a web caught during that
    // drop is still a launch off that roof.
    this.lastSurfaceY = ground.y;
    this.launching = false;
    this.sprite.setVelocity(0, 0);
    this.sprite.setAngle(0);
    this.sprite.clearTint();
  }

  public update(
    actions: ActionState,
    jumpPressed: boolean,
    webHeld: boolean,
    anchors: readonly AnchorPoint[],
    groundY: number,
    deltaMs: number,
  ): PlayerStep {
    const contact = this.readGroundContact();
    const frame = frameTimeFor(deltaMs);
    if (!frame) {
      return {
        mode: this.mode(contact),
        rope: this.rope,
        attached: false,
        released: false,
        jumped: false,
        landingImpact: 0,
      };
    }

    // Captured before anything can clear the rope: a ceiling bonk inside
    // `absorbCollisions` used to drop the line before the release was noticed,
    // so the web line stayed drawn and the slingshot flourish never fired.
    const ropeAtEntry = this.rope;
    const landingImpact = this.absorbCollisions(contact);

    if (webHeld && ropeAtEntry === undefined) {
      this.tryAttach(anchors, groundY);
    } else if (!webHeld) {
      this.rope = undefined;
    }

    const jumped = this.rope
      ? this.stepSwinging(actions, frame)
      : this.stepOnFoot(actions, jumpPressed, contact, frame);

    // Derived from the rope itself at both frame edges, so every way the line
    // can go — let go, ceiling, top of the arc — reports the same event.
    return {
      mode: this.mode(contact),
      rope: this.rope,
      attached: this.rope !== undefined && ropeAtEntry === undefined,
      released: this.rope === undefined && ropeAtEntry !== undefined,
      jumped,
      landingImpact,
    };
  }

  private mode(contact: boolean): PlayerMode {
    if (this.rope) {
      return "swinging";
    }
    return contact || this.withinGroundLatch() ? "grounded" : "airborne";
  }

  /** Raw Arcade contact for this frame; also refreshes the presentation latch. */
  private readGroundContact(): boolean {
    const body = this.sprite.body as Phaser.Physics.Arcade.Body;
    const contact = body.blocked.down || body.touching.down;
    if (contact) {
      this.lastGroundedAt = this.sprite.scene.time.now;
      this.lastSurfaceY = this.feetY();
    }
    return contact;
  }

  private feetY(): number {
    return this.sprite.y + feetOffset(this.sprite);
  }

  /**
   * The floor this catch has to clear, or `undefined` for a catch made in open
   * air. Only the surface the hero is still within jumping distance of counts:
   * further up they are flying, and a roof they left long ago is not below them
   * any more.
   */
  private launchFloor(): number | undefined {
    const surface = this.lastSurfaceY;
    if (surface === undefined) {
      return undefined;
    }
    const height = surface - this.feetY();
    return height >= 0 && height <= LAUNCH_BAND ? surface : undefined;
  }

  private withinGroundLatch(): boolean {
    return this.sprite.scene.time.now - this.lastGroundedAt < GROUND_LATCH_MS;
  }

  /**
   * Phaser resolved collisions after our last write. Where it stopped the body,
   * drop the sim velocity on that axis so we do not keep pushing into a wall.
   *
   * Returns the downward speed the floor swallowed, which is the weight of the
   * landing and the one number the scene needs to size its dust and its thump.
   */
  private absorbCollisions(contact: boolean): number {
    const body = this.sprite.body as Phaser.Physics.Arcade.Body;
    let landingImpact = 0;
    if (contact && this.velocity.y > 0) {
      landingImpact = this.velocity.y;
      this.velocity.y = 0;
    }
    if ((body.blocked.up || body.touching.up) && this.velocity.y < 0) {
      this.velocity.y = 0;
      this.rope = undefined;
    }
    // `touching` as well as `blocked`: a shove from a moving body only ever sets
    // `touching`, and ignoring it left the sim pushing sideways into an enemy.
    if ((body.blocked.left || body.touching.left) && this.velocity.x < 0) {
      this.velocity.x = 0;
    }
    if ((body.blocked.right || body.touching.right) && this.velocity.x > 0) {
      this.velocity.x = 0;
    }
    return landingImpact;
  }

  private stepOnFoot(
    actions: ActionState,
    jumpPressed: boolean,
    grounded: boolean,
    frame: FrameTime,
  ): boolean {
    const result = stepLocomotion(
      { position: this.position(), velocity: this.velocity },
      this.memory,
      {
        move: Number(actions.moveRight) - Number(actions.moveLeft),
        jumpHeld: actions.jump,
        jumpPressed,
        glideHeld: actions.glide,
      },
      grounded,
      DEFAULT_LOCOMOTION_TUNING,
      frame.sim,
    );

    this.memory = result.memory;
    const velocity = result.body.velocity;
    const position = result.body.position;

    // Resting contact: hold the hero on the floor instead of letting gravity
    // build a fall that Arcade has to separate out every single frame.
    if (grounded && !result.jumped && velocity.y > 0) {
      this.velocity = { x: velocity.x, y: 0 };
      const along = transportVelocity(
        { x: position.x - this.sprite.x, y: 0 },
        frame.transport,
      );
      this.sprite.setVelocity(along.x, GROUND_STICK);
      return result.jumped;
    }

    this.commit(position, velocity, frame);
    return result.jumped;
  }

  private stepSwinging(actions: ActionState, frame: FrameTime): boolean {
    const rope = this.rope;
    if (!rope) {
      return false;
    }

    // The swing solver reads -1 as reel in, +1 as let out.
    const commanded = Number(actions.reelOut) - Number(actions.reelIn);
    const tuning = this.launching ? LAUNCH_TUNING : SWING_TUNING;

    const result = stepSwing(
      { position: this.position(), velocity: this.velocity },
      rope,
      {
        reel:
          commanded !== 0 ? commanded : this.autoReel(rope, frame.sim, tuning),
        pump: Number(actions.moveRight) - Number(actions.moveLeft),
      },
      tuning,
      frame.sim,
    );
    this.launching = this.launching && result.rope.length > this.targetLength;

    this.memory = createLocomotionMemory();
    this.commit(result.body.position, result.body.velocity, frame);

    // Let go at the top rather than looping over the anchor: that is where the
    // slingshot exit lives, and it keeps the hero facing where they are going.
    this.rope =
      result.body.position.y <= result.rope.anchor.y ? undefined : result.rope;
    return false;
  }

  /**
   * Reel rate that lands on `targetLength` instead of sailing past it. The
   * solver reels `reelSpeed * step` every substep, so a flat -1 across a clamped
   * 50ms frame overshot by up to 13px and the resting rope length drifted with
   * the refresh rate.
   */
  private autoReel(rope: Rope, dt: number, tuning: SwingTuning): number {
    const excess = rope.length - this.targetLength;
    if (excess <= 0) {
      return 0;
    }
    return -Math.min(1, excess / (tuning.reelSpeed * dt));
  }

  /**
   * Hands Phaser the velocity that carries the body from where it is to where
   * the sim put it. Phaser integrates that and resolves collisions; whatever it
   * changes is read back next frame by `absorbCollisions`.
   *
   * The divisor is the *real* frame time, not the clamped sim time, so the body
   * lands on the sim's target however long Arcade ends up integrating for.
   * Arcade quantises that to whole 1/60 steps, which leaves a sub-frame lag —
   * harmless, because the sim reseeds from the sprite's real position next frame
   * rather than from its own last output, so nothing accumulates.
   */
  private commit(position: Vec2, velocity: Vec2, frame: FrameTime): void {
    const current = this.position();
    this.velocity = { x: velocity.x, y: velocity.y };
    const transport = transportVelocity(
      { x: position.x - current.x, y: position.y - current.y },
      frame.transport,
    );
    this.sprite.setVelocity(transport.x, transport.y);
  }

  private position(): Vec2 {
    return { x: this.sprite.x, y: this.sprite.y };
  }

  private tryAttach(anchors: readonly AnchorPoint[], groundY: number): void {
    // Solved against the floor the hero is actually standing over. Handing the
    // pavement to a rooftop catch is what let the solver pick an arc that dips
    // hundreds of pixels through the roof and drag the hero along it.
    const floor = this.launchFloor();
    const attachment = chooseAttachment(
      anchors,
      this.position(),
      this.headingSign(),
      floor ?? groundY,
      ATTACHMENT_TUNING,
    );
    if (!attachment) {
      return;
    }

    this.rope = { anchor: attachment.anchor, length: attachment.length };
    this.targetLength = attachment.targetLength;
    this.lastAnchor = attachment.anchor;

    // A shorter target than the line just thrown means this arc would scrape
    // the floor. Shove off along the line and haul it in until it will not:
    // clamping the rope short here instead would snap the hero onto the smaller
    // radius, and a plain pendulum from rest simply swings into the roof.
    this.launching =
      floor !== undefined && attachment.targetLength < attachment.length;
    if (this.launching) {
      this.kickAlongLine(attachment.anchor);
    }
  }

  /** Radial shove toward the anchor: it leaves the rope slack, so nothing jolts. */
  private kickAlongLine(anchor: Vec2): void {
    const toAnchor = {
      x: anchor.x - this.sprite.x,
      y: anchor.y - this.sprite.y,
    };
    const reach = Math.hypot(toAnchor.x, toAnchor.y);
    if (reach === 0) {
      return;
    }
    this.velocity = {
      x: this.velocity.x + (toAnchor.x / reach) * LAUNCH_SPEED,
      y: this.velocity.y + (toAnchor.y / reach) * LAUNCH_SPEED,
    };
  }

  public get releasedAnchor(): Vec2 | undefined {
    return this.lastAnchor;
  }

  private headingSign(): number {
    if (Math.abs(this.velocity.x) > 30) {
      return Math.sign(this.velocity.x);
    }
    return this.sprite.flipX ? -1 : 1;
  }
}
