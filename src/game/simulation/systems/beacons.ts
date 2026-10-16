/**
 * Aircraft-warning beacons on the Spire Ascent masts. A beacon is a web anchor
 * that only bites while its lamp is on: lit, then a flicker that warns the lamp
 * is about to die, then dark. The flicker still holds a web, so the tell is
 * never a lie.
 */
export interface BeaconBlink {
  litMs: number;
  flickerMs: number;
  darkMs: number;
  /** Offset into the cycle at level start, so neighbouring masts alternate. */
  offsetMs: number;
}

export type BeaconState = "lit" | "flicker" | "dark";

export const blinkPeriod = (blink: BeaconBlink): number =>
  blink.litMs + blink.flickerMs + blink.darkMs;

export const beaconStateAt = (
  blink: BeaconBlink,
  elapsedMs: number,
): BeaconState => {
  const period = blinkPeriod(blink);
  const phase = (((elapsedMs + blink.offsetMs) % period) + period) % period;

  if (phase < blink.litMs) {
    return "lit";
  }
  return phase < blink.litMs + blink.flickerMs ? "flicker" : "dark";
};

export const isBeaconCatchable = (state: BeaconState): boolean =>
  state !== "dark";
