/**
 * How the arrangement opens up across the run. One piece, six stems, and each
 * district adds one — so the score escalates without ever cutting to a
 * different track.
 */

import type { MusicLayer } from "./types";

/**
 * Indexed by `progression.levelIndex`, in the play order of
 * `src/game/content/levels.ts`.
 */
export const DISTRICT_TIERS: readonly (readonly MusicLayer[])[] = [
  // Midtown After Dark — bed and pulse of the city, nothing on top yet.
  ["pad", "bass"],
  // Park-Side Pursuit — the arpeggio starts running.
  ["pad", "bass", "arp"],
  // Spire Ascent — the tune arrives.
  ["pad", "bass", "arp", "lead"],
  // Harbor Crane Run — hats push it along.
  ["pad", "bass", "arp", "lead", "pulse"],
  // Bridge-Line Finale — offbeat stabs, everything playing.
  ["pad", "bass", "arp", "lead", "pulse", "stab"],
];

/** The title and pause bed: just the pad, breathing. */
export const IDLE_TIER: readonly MusicLayer[] = ["pad"];

export const tierForDistrict = (index: number): readonly MusicLayer[] => {
  const last = DISTRICT_TIERS.length - 1;
  return DISTRICT_TIERS[Math.min(Math.max(Math.trunc(index), 0), last)];
};
