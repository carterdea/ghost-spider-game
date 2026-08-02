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
  stepSwing,
} from "../../game/simulation/physics/swing";
import type { Vec2 } from "../../game/simulation/physics/vector";
import { standOn } from "./placement";

export type PlayerMode = "grounded" | "airborne" | "swinging";

export interface PlayerStep {
  mode: PlayerMode;
  rope?: Rope;
  /** True on the frame a web caught, for sound and camera punch. */
  attached: boolean;
  /** True on the frame a web released, for the slingshot flourish. */
  released: boolean;
  jumped: boolean;
}

/** A frame longer than this is a stall (tab switch); clamp so the sim never leaps. */
const MAX_FRAME_SECONDS = 1 / 20;

/**
 * Downward velocity kept while standing. Arcade needs a little push each frame
 * to keep reporting contact, but letting the sim's gravity accumulate makes
 * `blocked.down` stutter and jumps drop inputs.
 */
const GROUND_STICK = 40;

/**
 * Resting contact makes Arcade report `blocked.down` only on the frames it
 * actually separates the body, so raw reads stutter. Latching it briefly keeps
 * the run animation and ground handling steady.
 */
const GROUND_LATCH_MS = 90;

/** Lift given when a web catches from a standing start, so the hero leaves the floor. */
const LAUNCH_LIFT = 340;

/** Web swings are the fastest thing in the game, but not so fast they outrun the camera. */
const SWING_TUNING = { ...DEFAULT_SWING_TUNING, maxSpeed: 1250 };

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

  public constructor(sprite: Phaser.Physics.Arcade.Sprite) {
    this.sprite = sprite;
    const body = sprite.body as Phaser.Physics.Arcade.Body;
    body.setAllowGravity(false);
    body.setAllowDrag(false);
    sprite.setMaxVelocity(Number.MAX_SAFE_INTEGER);
  }

  public get isSwinging(): boolean {
    return this.rope !== undefined;
  }

  public get currentRope(): Rope | undefined {
    return this.rope;
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
    this.lastGroundedAt = Number.NEGATIVE_INFINITY;
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
    const dt = Math.min(deltaMs / 1000, MAX_FRAME_SECONDS);
    if (dt <= 0) {
      return {
        mode: this.mode(),
        attached: false,
        released: false,
        jumped: false,
      };
    }

    this.absorbCollisions();

    const wasSwinging = this.rope !== undefined;
    if (webHeld && !wasSwinging) {
      this.tryAttach(anchors, groundY);
    } else if (!webHeld && wasSwinging) {
      this.rope = undefined;
    }

    const attached = this.rope !== undefined && !wasSwinging;
    const released = this.rope === undefined && wasSwinging;
    const jumped = this.rope
      ? this.stepSwinging(actions, dt)
      : this.stepOnFoot(actions, jumpPressed, dt);

    return { mode: this.mode(), rope: this.rope, attached, released, jumped };
  }

  private mode(): PlayerMode {
    if (this.rope) {
      return "swinging";
    }
    return this.grounded() ? "grounded" : "airborne";
  }

  private grounded(): boolean {
    const body = this.sprite.body as Phaser.Physics.Arcade.Body;
    if (body.blocked.down || body.touching.down) {
      this.lastGroundedAt = this.sprite.scene.time.now;
      return true;
    }
    return this.sprite.scene.time.now - this.lastGroundedAt < GROUND_LATCH_MS;
  }

  /**
   * Phaser resolved collisions after our last write. Where it stopped the body,
   * drop the sim velocity on that axis so we do not keep pushing into a wall.
   */
  private absorbCollisions(): void {
    const body = this.sprite.body as Phaser.Physics.Arcade.Body;
    if ((body.blocked.down || body.touching.down) && this.velocity.y > 0) {
      this.velocity.y = 0;
    }
    if ((body.blocked.up || body.touching.up) && this.velocity.y < 0) {
      this.velocity.y = 0;
      this.rope = undefined;
    }
    if (body.blocked.left && this.velocity.x < 0) {
      this.velocity.x = 0;
    }
    if (body.blocked.right && this.velocity.x > 0) {
      this.velocity.x = 0;
    }
  }

  private stepOnFoot(
    actions: ActionState,
    jumpPressed: boolean,
    dt: number,
  ): boolean {
    const grounded = this.grounded();
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
      dt,
    );

    this.memory = result.memory;
    const velocity = result.body.velocity;
    const position = result.body.position;

    // Resting contact: hold the hero on the floor instead of letting gravity
    // build a fall that Arcade has to separate out every single frame.
    if (grounded && !result.jumped && velocity.y > 0) {
      this.velocity = { x: velocity.x, y: 0 };
      this.sprite.setVelocity((position.x - this.sprite.x) / dt, GROUND_STICK);
      return result.jumped;
    }

    this.commit(position, velocity, dt);
    return result.jumped;
  }

  private stepSwinging(actions: ActionState, dt: number): boolean {
    const rope = this.rope;
    if (!rope) {
      return false;
    }

    const commanded = Number(actions.moveDown) - Number(actions.moveUp);
    const autoReel = rope.length > this.targetLength ? -1 : 0;

    const result = stepSwing(
      { position: this.position(), velocity: this.velocity },
      rope,
      {
        reel: commanded !== 0 ? commanded : autoReel,
        pump: Number(actions.moveRight) - Number(actions.moveLeft),
      },
      SWING_TUNING,
      dt,
    );

    this.memory = createLocomotionMemory();
    this.commit(result.body.position, result.body.velocity, dt);

    // Let go at the top rather than looping over the anchor: that is where the
    // slingshot exit lives, and it keeps the hero facing where they are going.
    this.rope =
      result.body.position.y <= result.rope.anchor.y ? undefined : result.rope;
    return false;
  }

  /**
   * Hands Phaser the velocity that carries the body from where it is to where
   * the sim put it. Phaser integrates that and resolves collisions; whatever it
   * changes is read back next frame by `absorbCollisions`.
   */
  private commit(position: Vec2, velocity: Vec2, dt: number): void {
    const current = this.position();
    this.velocity = { x: velocity.x, y: velocity.y };
    this.sprite.setVelocity(
      (position.x - current.x) / dt,
      (position.y - current.y) / dt,
    );
  }

  private position(): Vec2 {
    return { x: this.sprite.x, y: this.sprite.y };
  }

  private tryAttach(anchors: readonly AnchorPoint[], groundY: number): void {
    const attachment = chooseAttachment(
      anchors,
      this.position(),
      this.headingSign(),
      groundY,
      ATTACHMENT_TUNING,
    );
    if (!attachment) {
      return;
    }

    this.rope = { anchor: attachment.anchor, length: attachment.length };
    this.targetLength = attachment.targetLength;
    this.lastAnchor = attachment.anchor;

    // Catching a web from a standing start used to drag the hero along the
    // floor until the rope went taut and whipped them backwards. Lift them off
    // so the very first frame of the swing is a real pendulum.
    if (this.grounded() && this.velocity.y >= 0) {
      this.velocity = { x: this.velocity.x, y: -LAUNCH_LIFT };
    }
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
