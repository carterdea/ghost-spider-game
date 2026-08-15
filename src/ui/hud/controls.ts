/** What the game is called, and how it is played. One list, two places. */

export const GAME_NAME = "Ghost Spider Swing";

export const GAME_TAGLINE = "Eight districts of painted New York night.";

export const HERO_NAME = "Ghost Pirouette";

/**
 * Every control, in the order a player meets them: move, then the web, then
 * the arsenal, then the switches. The corner hint chip and the title screen
 * both read this, so a new binding is written down exactly once.
 */
export const HINTS: ReadonlyArray<readonly [string, string]> = [
  ["A/D", "move"],
  ["W/S", "reel web"],
  ["Space", "jump"],
  ["E", "hold to swing"],
  ["J", "strike"],
  ["Q/K", "cycle / fire"],
  ["1-6", "pick weapon"],
  ["Shift", "glide"],
  ["Esc/P", "pause"],
  ["M", "mute"],
  ["R", "restart"],
];
