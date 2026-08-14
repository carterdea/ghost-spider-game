import type { GameAudio } from "../../audio";
import type { RunStatus } from "../../game/simulation/state";

/**
 * What the score does as a run changes state.
 *
 * It lives apart from the scene because it is a table, not a scene concern: one
 * status in, the same three calls out every time, and testable without booting
 * Phaser.
 *
 * The loop is never started here. A browser only lets an AudioContext run after
 * a gesture, so the scene starts the score from the first keypress — which on
 * the title screen is the press that starts the run anyway.
 */
export const syncRunMusic = (
  audio: GameAudio,
  status: RunStatus,
  levelIndex: number,
): void => {
  switch (status) {
    case "title":
      // The idle tier is the pad alone: a bed to read the controls over.
      audio.music.setIdle();
      audio.setWind(0);
      return;
    case "playing":
      audio.music.setDistrict(levelIndex);
      audio.music.start();
      return;
    case "paused":
      // Ducked rather than stopped. Killing the loop would restart the
      // arrangement from the top on every resume; dropping to the pad keeps the
      // same take running under the panel.
      audio.music.setIdle();
      audio.setWind(0);
      return;
    case "cleared":
    case "knockedOut":
      // The run's own cue is fired by whatever ended it; this only makes sure
      // the wind bed does not keep blowing over a hero who has stopped moving.
      audio.setWind(0);
      return;
  }
};
