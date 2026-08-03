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
  state.player.score += Math.round(
    TAKEDOWN_SCORE[enemy.kind] * comboMultiplier(chain),
  );
  state.player.message =
    chain > 1
      ? `${TAKEDOWN_MESSAGE[enemy.kind]} ${chain} chain!`
      : TAKEDOWN_MESSAGE[enemy.kind];
  return true;
};
