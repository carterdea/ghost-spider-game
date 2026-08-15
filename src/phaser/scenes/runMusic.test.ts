import { describe, expect, test } from "bun:test";
import type { GameAudio } from "../../audio";
import type { RunStatus } from "../../game/simulation/state";
import { syncRunMusic } from "./runMusic";

/** Records the calls the score would have made. Nothing here makes a sound. */
class AudioSpy {
  public readonly calls: string[] = [];

  public readonly music = {
    start: (): void => {
      this.calls.push("start");
    },
    stop: (): void => {
      this.calls.push("stop");
    },
    setIdle: (): void => {
      this.calls.push("setIdle");
    },
    setDistrict: (index: number): void => {
      this.calls.push(`setDistrict:${index}`);
    },
    cue: (): void => {
      this.calls.push("cue");
    },
    isPlaying: (): boolean => false,
  };

  public setWind(intensity: number): void {
    this.calls.push(`wind:${intensity}`);
  }
}

const sync = (status: RunStatus, levelIndex = 0): string[] => {
  const audio = new AudioSpy();
  syncRunMusic(audio as unknown as GameAudio, status, levelIndex);
  return audio.calls;
};

describe("syncRunMusic", () => {
  test("the title gets the idle bed and never opens a context itself", () => {
    // `start` would build the AudioContext; a browser only allows that from a
    // gesture, so the title leaves it to the keypress that starts the run.
    expect(sync("title")).toEqual(["setIdle", "wind:0"]);
  });

  test("play swells into the district the hero is in", () => {
    expect(sync("playing", 5)).toEqual(["setDistrict:5", "start"]);
  });

  test("a pause ducks to the pad rather than killing the loop", () => {
    const calls = sync("paused", 3);

    expect(calls).toEqual(["setIdle", "wind:0"]);
    expect(calls).not.toContain("stop");
  });

  test("resuming puts the arrangement back where it was", () => {
    expect(sync("playing", 3)).toEqual(["setDistrict:3", "start"]);
  });

  test("a finished run drops the wind and leaves the cue to the scene", () => {
    for (const status of ["cleared", "knockedOut"] as const) {
      expect(sync(status)).toEqual(["wind:0"]);
    }
  });
});
