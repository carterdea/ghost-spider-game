import type { Vec2 } from "../physics/vector";
import type { ActorKind, EnemyState, GameState } from "../state";

/**
 * A run of takedowns landed without touching the ground.
 *
 * It lives here rather than in `GameState` because nothing else in the
 * simulation reads it: the rule that pays it out and the counter it pays from
 * belong together, and the HUD only ever needs the number.
 */
export interface ComboState {
  /** Takedowns in the chain currently running. Zero between chains. */
  count: number;
  /** Longest chain of the run so far. */
  best: number;
}

export const createCombo = (): ComboState => ({ count: 0, best: 0 });

/** Links past this pay the same: the chain is a reward, not a runaway. */
const MAX_CHAIN = 7;

/**
 * Half a multiplier per link, so the third takedown of a chain is worth double
 * and the seventh is worth four times. Ungraded chains — a lone takedown, or
 * one scored without a chain at all — pay flat.
 */
export const comboMultiplier = (chain: number): number =>
  1 + (Math.min(Math.max(chain, 1), MAX_CHAIN) - 1) * 0.5;

/** Ends the chain. The hero touching the ground is what breaks it. */
export const breakCombo = (combo: ComboState): void => {
  combo.count = 0;
};

const extendCombo = (combo: ComboState): number => {
  combo.count += 1;
  combo.best = Math.max(combo.best, combo.count);
  return combo.count;
};

const TAKEDOWN_SCORE: Record<ActorKind, number> = {
  gunner: 250,
  drone: 180,
  robot: 150,
  boss: 2500,
};

const STAGGER_MESSAGE: Record<ActorKind, string> = {
  gunner: "The hooded gunner staggers.",
  drone: "Drone rotors sputter.",
  robot: "Robot armor cracked.",
  boss: "The Weaver's plating splits.",
};

const TAKEDOWN_MESSAGE: Record<ActorKind, string> = {
  gunner: "Gunner disarmed.",
  drone: "Drone clipped.",
  robot: "Robot dismantled.",
  boss: "The Weaver falls.",
};

/**
 * Health returned by a takedown, before the chain multiplies it.
 *
 * The run carries one health bar across eight districts into a boss, and
 * nothing anywhere refilled it: a hero who took a beating in the first district
 * arrived at the Weaver already half spent, with no way back. Paying it out of
 * takedowns rather than out of pickups keeps the answer inside the fighting —
 * every district can be crossed without throwing a punch, so the reason to
 * throw one has to be that fighting pays for itself.
 *
 * It is deliberately small against what a mistake costs: a robot's tackle is
 * 10 to 16 depending on the district, so a lone takedown does not pay for the
 * hit it took to line up. A chain does.
 */
const TAKEDOWN_HEAL = 4;

/** Silk spun back in. Never past full: a chain cannot bank health for later. */
export const healPlayer = (state: GameState, amount: number): void => {
  state.player.health = Math.min(
    state.player.maxHealth,
    state.player.health + amount,
  );
};

export const damagePlayer = (
  state: GameState,
  amount: number,
  message: string,
): void => {
  state.player.health = Math.max(0, state.player.health - amount);
  state.player.message =
    state.player.health === 0
      ? "You were knocked out. Press R to restart."
      : message;
};

/**
 * Applies damage and returns whether it was the killing blow. Pass `combo` to
 * score the takedown as part of a chain; without it the takedown pays flat, so
 * a caller that does not track chains still works.
 */
export const damageEnemy = (
  state: GameState,
  enemy: EnemyState,
  amount: number,
  combo?: ComboState,
): boolean => {
  enemy.health = Math.max(0, enemy.health - amount);

  if (enemy.health > 0) {
    state.player.message = STAGGER_MESSAGE[enemy.kind];
    return false;
  }

  const chain = combo ? extendCombo(combo) : 1;
  // Published to the run so the end-of-run panel has it: the chain itself is
  // gone by then, broken by the landing that followed it.
  state.progression.bestChain = Math.max(state.progression.bestChain, chain);
  const multiplier = comboMultiplier(chain);
  state.player.score += Math.round(TAKEDOWN_SCORE[enemy.kind] * multiplier);
  healPlayer(state, Math.round(TAKEDOWN_HEAL * multiplier));
  state.player.message =
    chain > 1
      ? `${TAKEDOWN_MESSAGE[enemy.kind]} ${chain} chain!`
      : TAKEDOWN_MESSAGE[enemy.kind];
  return true;
};

/**
 * How hard a contact hit throws the hero clear of whatever hit them.
 *
 * Being touched has to end the contact, not merely start a timer. With only an
 * invulnerability window between hits, a single melee enemy standing on the
 * hero deals its damage on every tick of that window and there is no input that
 * escapes it: one 11-damage robot measured 8 hits in 5 seconds, out-killing a
 * district holding seven enemies. Throwing the hero out of reach turns a hit
 * into something to recover from, which is the same read every telegraphed
 * attack in the game already asks for.
 */
export const CONTACT_KNOCKBACK = {
  /** Push away from the enemy, in px/s. */
  speed: 380,
  /** Upward component, so the hero is lifted off rather than scraped along. */
  lift: -260,
} as const;

/**
 * The velocity that throws `hero` away from `source`. Directly overhead or
 * exactly co-located falls back to a straight lift, since there is no side to
 * be thrown towards.
 */
export const contactKnockback = (hero: Vec2, source: Vec2): Vec2 => {
  const away = hero.x - source.x;
  const heading = away === 0 ? 0 : Math.sign(away);
  return {
    x: heading * CONTACT_KNOCKBACK.speed,
    y: CONTACT_KNOCKBACK.lift,
  };
};
