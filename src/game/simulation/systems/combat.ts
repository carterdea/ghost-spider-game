import type { EnemyState, GameState } from "../state";

export const damagePlayer = (state: GameState, amount: number, message: string): void => {
  state.player.health = Math.max(0, state.player.health - amount);
  state.player.message = state.player.health === 0 ? "You were knocked out. Press R to restart." : message;
};

export const damageEnemy = (state: GameState, enemy: EnemyState, amount: number): boolean => {
  enemy.health = Math.max(0, enemy.health - amount);

  if (enemy.health > 0) {
    state.player.message = enemy.kind === "gunner" ? "The hooded gunner staggers." : "Robot armor cracked.";
    return false;
  }

  state.player.score += enemy.kind === "gunner" ? 250 : 150;
  state.player.message = enemy.kind === "gunner" ? "Gunner disarmed." : "Robot dismantled.";
  return true;
};
