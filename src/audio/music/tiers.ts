/**
 * How the arrangement opens up across the run. One piece, six stems, and a
 * district-by-district arrangement of them — so the score follows the run
 * without ever cutting to a different track.
 *
 * Eight districts and six stems means "add one every district" cannot work,
 * and it should not: a run that only ever accumulates has heard everything by
 * the sixth district and arrives nowhere. So the run is scored as two waves.
 *
 * The first wave builds bass → arp → lead → pulse and peaks at the machine
 * district. Glasshouse Terraces then takes the floor out: the level whose glass
 * panels drop from under the hero loses its bass and its arpeggio, leaving the
 * tune exposed over a ticking hat. The second wave rebuilds from there and
 * brings a colour the first wave never used — the offbeat stabs — so it climbs
 * past the first peak instead of merely repeating it, and the finale is the one
 * place every stem plays at once.
 */

import type { MusicLayer } from "./types";

/**
 * Indexed by `progression.levelIndex`, in the play order of
 * `src/game/content/levels.ts`. One entry per level, checked by test.
 */
export const DISTRICT_TIERS: readonly (readonly MusicLayer[])[] = [
  // Midtown After Dark — the city at night. Bed and heartbeat, nothing on top.
  ["pad", "bass"],
  // Park-Side Pursuit — the chase starts, so the arpeggio starts running.
  ["pad", "bass", "arp"],
  // Switchyard Skywire — one long committed line over the rail cuts, and the
  // sustained tune to carry it.
  ["pad", "bass", "arp", "lead"],
  // Drydock Hoists — everything here moves on a timer, so the hats arrive.
  // The high-water mark of the first wave.
  ["pad", "bass", "arp", "lead", "pulse"],
  // Glasshouse Terraces — the panels give way underfoot. So does the score:
  // bass and arpeggio drop out and the tune is left hanging over the ticking.
  ["pad", "pulse", "lead"],
  // Spire Ascent — the climb. Stabs push it upward, a colour held back until
  // now so the second wave sounds like a rise and not a rerun.
  ["pad", "bass", "lead", "stab"],
  // Harbor Crane Run — the arpeggio comes back and it runs flat out.
  ["pad", "bass", "arp", "lead", "stab"],
  // Bridge-Line Finale — the arrival, and the only place all six play at once.
  ["pad", "bass", "arp", "lead", "pulse", "stab"],
];

/** The title and pause bed: just the pad, breathing. */
export const IDLE_TIER: readonly MusicLayer[] = ["pad"];

export const tierForDistrict = (index: number): readonly MusicLayer[] => {
  const last = DISTRICT_TIERS.length - 1;
  return DISTRICT_TIERS[Math.min(Math.max(Math.trunc(index), 0), last)];
};
