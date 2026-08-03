import { clamp } from "../../game/simulation/physics/vector";

/**
 * The colour every wind-up shares: white at rest, hot pink at the moment the
 * strike lands. One ramp for patrols and the boss alike, so a tell always
 * means the same thing.
 */
export const telegraphTint = (amount: number): number => {
  const mix = clamp(amount, 0, 1);
  const green = Math.round(255 - 178 * mix);
  const blue = Math.round(255 - 146 * mix);
  return (255 << 16) | (green << 8) | blue;
};
