import Phaser from "phaser";
import { artKeys, colors } from "../../game/assets/manifest";
import type {
  EnemyLane,
  EnemySpawn,
  LevelDefinition,
} from "../../game/content/levels";
import type {
  EnemyKind,
  EnemyState,
  GameState,
} from "../../game/simulation/state";
import { applyBodyBox, BODY_BOXES, standOn } from "./placement";

export interface EnemyView {
  state: EnemyState;
  sprite: Phaser.Physics.Arcade.Sprite;
  lane: EnemyLane;
  direction: number;
  nextShotAt: number;
  snaredUntil: number;
  /** Y the drone bobs around; air enemies ignore gravity. */
  hoverY: number;
}

const SHOT_INTERVAL: Record<EnemyKind, number> = {
  robot: Number.POSITIVE_INFINITY,
  gunner: 1550,
  drone: 1900,
};

const SIGHT_RANGE: Record<EnemyKind, number> = {
  robot: 0,
  gunner: 680,
  drone: 560,
};

const SNARE_DURATION = 1800;

/** Owns every enemy sprite and their bullets for the level currently loaded. */
export class EnemyDirector {
  private readonly scene: Phaser.Scene;
  private views: EnemyView[] = [];
  private bulletGroup?: Phaser.Physics.Arcade.Group;

  public constructor(scene: Phaser.Scene) {
    this.scene = scene;
  }

  public get bullets(): Phaser.Physics.Arcade.Group {
    if (!this.bulletGroup) {
      this.bulletGroup = this.scene.physics.add.group({ allowGravity: false });
    }
    return this.bulletGroup;
  }

  public get all(): readonly EnemyView[] {
    return this.views;
  }

  public spawn(
    level: LevelDefinition,
    state: GameState,
    platforms: Phaser.Physics.Arcade.StaticGroup,
  ): void {
    this.clear();

    for (const spawn of level.enemies) {
      const enemyState = state.enemies.find((entry) => entry.id === spawn.id);
      if (!enemyState) {
        continue;
      }
      this.views.push(this.createView(spawn, enemyState, platforms));
    }
  }

  private createView(
    spawn: EnemySpawn,
    state: EnemyState,
    platforms: Phaser.Physics.Arcade.StaticGroup,
  ): EnemyView {
    const sprite = this.scene.physics.add.sprite(
      spawn.position.x,
      spawn.position.y,
      textureFor(spawn.kind),
    );
    sprite.setScale(spawn.kind === "gunner" ? 0.65 : 0.58);
    sprite.setCollideWorldBounds(true);
    sprite.setDepth(3);
    applyBodyBox(sprite, BODY_BOXES[spawn.kind]);
    sprite.play(animationFor(spawn.kind));

    const airborne = spawn.lane === "air";
    sprite.body?.setAllowGravity(!airborne);
    if (airborne) {
      sprite.setPosition(spawn.position.x, spawn.position.y);
    } else {
      standOn(sprite, spawn.position.x, spawn.position.y);
      this.scene.physics.add.collider(sprite, platforms);
    }

    return {
      state,
      sprite,
      lane: spawn.lane,
      direction: 1,
      nextShotAt: 0,
      snaredUntil: 0,
      hoverY: spawn.position.y,
    };
  }

  public update(time: number, player: Phaser.Physics.Arcade.Sprite): void {
    for (const view of this.views) {
      if (!view.sprite.active) {
        continue;
      }

      if (time < view.snaredUntil) {
        view.sprite.setVelocityX(0);
        continue;
      }

      this.patrol(view, time);
      this.maybeShoot(view, time, player);
    }
  }

  private patrol(view: EnemyView, time: number): void {
    const { sprite, state } = view;

    if (sprite.x <= state.patrolMinX) {
      view.direction = 1;
    } else if (sprite.x >= state.patrolMaxX) {
      view.direction = -1;
    }

    sprite.setVelocityX(view.direction * state.speed);
    sprite.setFlipX(view.direction < 0);

    if (view.lane === "air") {
      const bob = Math.sin(time / 260 + sprite.x * 0.01) * 52;
      sprite.setVelocityY((view.hoverY + bob - sprite.y) * 2);
    }
  }

  private maybeShoot(
    view: EnemyView,
    time: number,
    player: Phaser.Physics.Arcade.Sprite,
  ): void {
    if (time < view.nextShotAt) {
      return;
    }

    const range = SIGHT_RANGE[view.state.kind];
    const distance = Phaser.Math.Distance.Between(
      player.x,
      player.y,
      view.sprite.x,
      view.sprite.y,
    );
    if (range === 0 || distance > range) {
      return;
    }

    this.fire(view, player);
    view.nextShotAt = time + SHOT_INTERVAL[view.state.kind];
  }

  private fire(view: EnemyView, player: Phaser.Physics.Arcade.Sprite): void {
    const drone = view.state.kind === "drone";
    const bullet = this.bullets.create(
      view.sprite.x,
      view.sprite.y + (drone ? 18 : 4),
      "bullet",
    ) as Phaser.Physics.Arcade.Sprite;

    const angle = Phaser.Math.Angle.Between(
      view.sprite.x,
      view.sprite.y,
      player.x,
      player.y,
    );
    const speed = drone ? 300 : 360;
    bullet.setVelocity(Math.cos(angle) * speed, Math.sin(angle) * speed);
    bullet.setTint(drone ? colors.balletTeal : colors.danger);
    bullet.setDepth(4);
    this.scene.time.delayedCall(2600, () => bullet.destroy());
  }

  public snare(view: EnemyView): void {
    view.snaredUntil = this.scene.time.now + SNARE_DURATION;
    view.sprite.setTint(colors.web);
    this.scene.time.delayedCall(SNARE_DURATION, () => {
      if (view.sprite.active) {
        view.sprite.clearTint();
      }
    });
  }

  public defeat(view: EnemyView): void {
    view.sprite.destroy();
  }

  public clear(): void {
    for (const view of this.views) {
      view.sprite.destroy();
    }
    this.views = [];
    this.bulletGroup?.clear(true, true);
  }
}

const textureFor = (kind: EnemyKind): string => {
  if (kind === "gunner") {
    return artKeys.enforcer[0];
  }
  return kind === "drone" ? artKeys.drone[0] : artKeys.robot[0];
};

const animationFor = (kind: EnemyKind): string => {
  if (kind === "gunner") {
    return "gunner-walk";
  }
  return kind === "drone" ? "drone-fly" : "robot-walk";
};
