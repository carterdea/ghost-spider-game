import type { SoundEvent } from "../../audio/events";
import type { LevelDefinition } from "../../game/content/levels";
import { BOSS_BASE_SPEED, type BossEvent } from "../../game/simulation/ai";
import { clamp } from "../../game/simulation/physics/vector";
import type { BossSpawn } from "../../game/simulation/state";

/**
 * What the scene needs to know about the finale boss, and nothing else: where
 * it stands, and what each beat of the fight sounds like.
 */

export const BOSS_ID = "the-weaver";

/** How far either side of the beacon the Weaver may roam. */
const ARENA_REACH = 1500;

/** Ceiling of the arena. The fight happens above the rooftops, not in orbit. */
const ARENA_TOP = 150;

/** The Weaver hangs this far above the beacon it is guarding. */
const HOVER_ABOVE_GOAL = 320;

/**
 * Sized against what the fight actually pays out rather than how long it ought
 * to feel. The Weaver can only be hurt inside its punish window, which comes
 * round roughly every three seconds and is worth about forty damage to a player
 * who takes all of it — so every hundred health here is another eight windows
 * of reading tells, and 900 was a fight no measured attempt ever finished.
 *
 * This is about twenty seconds of clean play, and the hero does not arrive with
 * a full bar: the health they bring is whatever the eight districts left them,
 * so the fight is sized for someone who spent some of it getting here.
 */
const BOSS_HEALTH = 260;

/**
 * Contact damage. Its projectiles use the scene's own bullet damage.
 *
 * Lower than it was because the punish window now brings the hull down onto the
 * hero: they end every window inside its reach, and the fight has to be
 * survivable by someone who takes that trade a dozen times.
 */
const BOSS_CONTACT_DAMAGE = 10;

/**
 * The boss, placed from the level it guards.
 *
 * The arena is clamped to the level's own bounds rather than simply spanning
 * `ARENA_REACH` each way: the finale's beacon sits near the east edge, and an
 * arena hanging off the end of the world would have the brain steering into a
 * wall Arcade will not let it through, pinning the fight against the bound.
 */
export const bossSpawnFor = (level: LevelDefinition): BossSpawn => {
  const left = clamp(level.goal.x - ARENA_REACH, 0, level.width);
  const right = clamp(level.goal.x + ARENA_REACH, 0, level.width);

  return {
    id: BOSS_ID,
    position: { x: level.goal.x, y: level.goal.y - HOVER_ABOVE_GOAL },
    arena: {
      x: left,
      y: ARENA_TOP,
      width: right - left,
      height: level.streetY - ARENA_TOP,
    },
    health: BOSS_HEALTH,
    damage: BOSS_CONTACT_DAMAGE,
    speed: BOSS_BASE_SPEED,
  };
};

/** One beat of the fight, as the sound it makes. */
const BOSS_SOUNDS: Record<BossEvent, SoundEvent> = {
  wake: "bossWake",
  phaseShift: "bossPhaseShift",
  volley: "bossVolley",
  slam: "bossSlam",
  nova: "bossNova",
  stagger: "bossStagger",
  defeated: "bossDefeated",
};

export const bossSound = (event: BossEvent): SoundEvent => BOSS_SOUNDS[event];
