import type Phaser from "phaser";
import type { GameAudio } from "../../audio";
import type { GameState } from "../../game/simulation/state";
import {
  contactKnockback,
  damagePlayer,
} from "../../game/simulation/systems/combat";
import type { EnemyDirector, EnemyView } from "../actors/EnemyDirector";
import type { PlayerController } from "../actors/PlayerController";
import type { WebRenderer } from "../fx/WebRenderer";
import type { LevelWorld } from "../world/LevelWorld";
import type { RunFeedback } from "./feedback";

/** One shared window of invulnerability after any hit the hero takes. */
const HIT_COOLDOWN = 700;

/**
 * The stand-off numbers. Deliberately below the strike: closing is the risk,
 * so it is where the damage lives — see `STRIKE_DAMAGE` in `GameScene`.
 */
const GLOB_DAMAGE = 16;
const NET_DAMAGE = 12;

/**
 * Everything the collision handlers reach for. Passed in rather than read off
 * the scene so the wiring can be registered against a test double: Phaser will
 * not boot under happy-dom, and a `GameScene` that cannot be built is a
 * `GameScene` whose collision rules cannot be tested.
 */
export interface CombatDeps {
  scene: Phaser.Scene;
  state: GameState;
  player: Phaser.Physics.Arcade.Sprite;
  enemies: EnemyDirector;
  world: LevelWorld;
  projectiles: Phaser.Physics.Arcade.Group;
  feedback: RunFeedback;
  webs?: WebRenderer;
  controller?: PlayerController;
  audio?: GameAudio;
  /** False once the run is over, while the world is still being torn down. */
  isPlaying(): boolean;
}

const contactMessage = (enemy: EnemyView): string => {
  if (enemy.state.kind === "gunner") {
    return "Close-range blast.";
  }
  return enemy.state.kind === "drone" ? "Drone zap." : "Robot tackle.";
};

/**
 * Wires every combat collision for the level currently loaded.
 *
 * Called once per level, after the spawns, because it walks `enemies.all` and
 * the boss has to be in that list by then. The hit cooldown lives in this
 * closure for the same reason: a fresh level gets a fresh one, with no field on
 * the scene to forget to reset.
 */
export const registerCombat = (deps: CombatDeps): void => {
  const { scene, state, player, world } = deps;
  // Annotated rather than destructured. Dead-code analysis resolves a method
  // against the declared type of whatever it is called on, and a destructured
  // binding carries no declaration — calling `snare`, `hurt` or `shove` off one
  // makes all three read as unreferenced everywhere in the project.
  const enemies: EnemyDirector = deps.enemies;
  const feedback: RunFeedback = deps.feedback;
  const controller: PlayerController | undefined = deps.controller;
  let hitCooldownUntil = 0;

  world.collider(
    scene.physics.add.overlap(player, enemies.bullets, (_, bulletObject) => {
      // A held world runs no physics, so this should not fire at all once the
      // run is over — but a teardown releases the world for a frame, and one
      // frame of a shot still in the air was enough to knock out a hero who
      // had already cleared the skyline.
      if (!deps.isPlaying()) {
        return;
      }
      (bulletObject as Phaser.Physics.Arcade.Sprite).destroy();
      if (scene.time.now < state.player.shieldUntil) {
        deps.audio?.play("shieldBlock");
        state.player.message = "Web shield caught the shot.";
        return;
      }
      damagePlayer(state, 12, "Hit by a skyline shot.");
      feedback.hurt();
      // Silent at zero health: `knockOut` has its own, louder sound.
      if (state.player.health > 0) {
        deps.audio?.play("playerHurt");
      }
    }),
  );

  // Targeting treats buildings as sight blockers, so gunfire has to respect
  // the same geometry. Without this a shot crosses a roof and still lands,
  // and breaking line of sight after reading a telegraph buys nothing.
  world.collider(
    scene.physics.add.collider(
      enemies.bullets,
      world.platforms,
      (bulletObject) => {
        (bulletObject as Phaser.Physics.Arcade.Sprite).destroy();
      },
    ),
  );

  // The same rule for the hero's own globs and nets: they are thrown through
  // the world, not over it.
  world.collider(
    scene.physics.add.collider(
      deps.projectiles,
      world.platforms,
      (projectileObject) => {
        (projectileObject as Phaser.Physics.Arcade.Sprite).destroy();
      },
    ),
  );

  for (const enemy of enemies.all) {
    // Sprite first, group second: Arcade hands the callback the lone sprite
    // before the group member, so the other order would treat the enemy as
    // the projectile and destroy it on the first hit.
    world.collider(
      scene.physics.add.overlap(
        enemy.sprite,
        deps.projectiles,
        (_, projectileObject) => {
          const projectile = projectileObject as Phaser.Physics.Arcade.Sprite;
          if (!projectile.active) {
            return;
          }
          const power = projectile.getData("power") as "glob" | "net";
          // Read before it is destroyed: the sparks fly from where the web
          // struck, not from the enemy's centre.
          const struckAt = { x: projectile.x, y: projectile.y };
          deps.webs?.splat(struckAt, power === "net" ? 1 : 0.45);
          projectile.destroy();
          if (power === "net") {
            enemies.snare(enemy);
            deps.audio?.play("enemySnared");
          }
          const defeated = feedback.damage(
            state,
            enemy.state,
            power === "net" ? NET_DAMAGE : GLOB_DAMAGE,
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
      scene.physics.add.overlap(player, enemy.sprite, () => {
        if (
          !deps.isPlaying() ||
          scene.time.now < hitCooldownUntil ||
          scene.time.now < enemy.snaredUntil ||
          // Harmless touch is not a hit. The brain zeroes contact damage
          // outside a committed strike, and the cooldown is shared across
          // every enemy: brushing a patrol would otherwise announce a hit
          // that never happened and buy 700ms of immunity that swallows a
          // real lunge from someone else.
          enemy.state.damage <= 0
        ) {
          return;
        }
        hitCooldownUntil = scene.time.now + HIT_COOLDOWN;
        damagePlayer(state, enemy.state.damage, contactMessage(enemy));
        // Thrown clear, not merely made invulnerable. Without this the hero
        // stays inside the enemy and takes the same hit on every tick of the
        // cooldown, with no input that escapes it. It goes through the
        // controller because the sim owns velocity — and it can only fire on
        // a frame the physics world ran, so a pause or a hit-stop can never
        // bank one and spend it on the frame the world comes back.
        controller?.shove(
          contactKnockback(
            { x: player.x, y: player.y },
            { x: enemy.sprite.x, y: enemy.sprite.y },
          ),
        );
        feedback.hurt();
        if (state.player.health > 0) {
          deps.audio?.play("playerHurt");
        }
      }),
    );
  }
};
