import {
  afterAll,
  beforeAll,
  beforeEach,
  describe,
  expect,
  test,
} from "bun:test";
import { GlobalRegistrator } from "@happy-dom/global-registrator";
import { LEVELS } from "../../game/content/levels";
import { MAX_MUSIC_VOICES, MUSIC_LEVEL } from "../engine";
import { type AudioOptions, createAudio, type GameAudio } from "../index";
import {
  asContext,
  FakeContext,
  type FakeGain,
  type FakeNode,
  FakeOscillator,
} from "../testing/fakeAudioContext";
import { CUES } from "./cues";
import { createMusic, type StopTimer } from "./index";
import { frequencyOf, midiOf, pitchClassOf } from "./notes";
import { flattenSong, Sequencer } from "./sequencer";
import { BEATS_PER_BAR, LOOP_BEATS, SONG } from "./song";
import { DISTRICT_TIERS, tierForDistrict } from "./tiers";
import type { MusicLayer, ScheduledNote } from "./types";
import { noteLayers, stackGain } from "./voices";

const SECONDS_PER_BEAT = 60 / SONG.bpm;

let context: FakeContext;
let tick: (() => void) | undefined;
let tickIntervalMs = 0;

/** Stands in for `setInterval`, so the test owns every pump. */
const timer = (fn: () => void, ms: number): StopTimer => {
  tick = fn;
  tickIntervalMs = ms;
  return () => {
    tick = undefined;
  };
};

const build = (options: AudioOptions = {}): GameAudio =>
  createAudio({
    createContext: () => asContext(context),
    now: () => 0,
    ...options,
    music: { timer, ...options.music },
  });

/** Moves the audio clock forward in pump-sized steps, ticking as it goes. */
const run = (seconds: number, stepMs = 25): void => {
  const steps = Math.round((seconds * 1000) / stepMs);
  for (let index = 0; index < steps; index += 1) {
    context.advance(stepMs / 1000);
    tick?.();
  }
};

beforeAll(() => {
  GlobalRegistrator.register();
});

afterAll(async () => {
  await GlobalRegistrator.unregister();
});

beforeEach(() => {
  localStorage.clear();
  context = new FakeContext();
  tick = undefined;
  tickIntervalMs = 0;
});

describe("pitch names", () => {
  test("anchors on A4", () => {
    expect(midiOf("A4")).toBe(69);
    expect(frequencyOf("A4")).toBeCloseTo(440, 6);
  });

  test("reads accidentals and octaves", () => {
    expect(midiOf("C4")).toBe(60);
    expect(midiOf("C-1")).toBe(0);
    expect(midiOf("F#3")).toBe(54);
    expect(midiOf("Gb3")).toBe(54);
    expect(frequencyOf("A3")).toBeCloseTo(220, 6);
    expect(frequencyOf("A5")).toBeCloseTo(880, 6);
  });

  test("detunes by fractional semitones", () => {
    // Twelve cents is a hair sharp, not a different note.
    expect(frequencyOf("A4", 0.12)).toBeGreaterThan(440);
    expect(frequencyOf("A4", 0.12)).toBeLessThan(444);
  });

  test("refuses anything that is not a pitch", () => {
    expect(() => midiOf("H4")).toThrow(RangeError);
    expect(() => midiOf("A")).toThrow(RangeError);
    expect(() => midiOf("")).toThrow(RangeError);
  });
});

/**
 * The composition cannot be listened to from a test, so it is checked against
 * the theory it was written to: one key, sane registers, nothing clashing, and
 * enough headroom that the sum of every voice cannot clip.
 */
describe("the composition", () => {
  /** A natural minor: A B C D E F G. */
  const A_MINOR = new Set([9, 11, 0, 2, 4, 5, 7]);
  /** Noise pitches are band-pass centres, not notes, so they sit outside key. */
  const pitched = flattenSong(SONG).filter((note) => note.layer !== "pulse");

  test("loops on a whole number of bars", () => {
    expect(LOOP_BEATS % BEATS_PER_BAR).toBe(0);
    expect(SONG.loopBeats).toBe(LOOP_BEATS);
    expect(LOOP_BEATS * SECONDS_PER_BEAT).toBeCloseTo(18.46, 2);
  });

  test("stays in A minor", () => {
    const strays = pitched.filter(
      (note) => !A_MINOR.has(pitchClassOf(note.note)),
    );
    expect(strays).toEqual([]);
  });

  test("keeps every part in its own register", () => {
    const range = (layer: MusicLayer): [number, number] => {
      const notes = pitched
        .filter((note) => note.layer === layer)
        .map((note) => midiOf(note.note));
      return [Math.min(...notes), Math.max(...notes)];
    };

    // Bass under the pad, pad under the arpeggio, lead over the top.
    expect(range("bass")).toEqual([midiOf("F1"), midiOf("C3")]);
    expect(range("pad")).toEqual([midiOf("G3"), midiOf("F4")]);
    expect(range("arp")).toEqual([midiOf("F4"), midiOf("G5")]);
    expect(range("lead")).toEqual([midiOf("B4"), midiOf("C6")]);
  });

  test("never sounds two notes a semitone apart", () => {
    const spans = pitched.flatMap((note) => {
      const span = {
        from: note.beat,
        to: note.beat + note.length,
        midi: midiOf(note.note),
      };
      // A note that runs past the loop point meets the next pass's downbeat.
      return span.to <= LOOP_BEATS
        ? [span]
        : [
            span,
            { ...span, from: span.from - LOOP_BEATS, to: span.to - LOOP_BEATS },
          ];
    });

    const clashes: string[] = [];
    for (let i = 0; i < spans.length; i += 1) {
      for (let j = i + 1; j < spans.length; j += 1) {
        const [a, b] = [spans[i], spans[j]];
        if (a.to <= b.from || b.to <= a.from) {
          continue;
        }
        const gap = Math.abs(a.midi - b.midi);
        if (gap === 1 || gap === 13) {
          clashes.push(
            `${a.midi}/${b.midi} at beat ${Math.max(a.from, b.from)}`,
          );
        }
      }
    }
    expect(clashes).toEqual([]);
  });

  test("keeps the low end clear of stacked intervals", () => {
    // Anything tighter than a fifth below G3 turns to mud on a small speaker.
    const low = pitched.filter((note) => midiOf(note.note) < midiOf("G3"));
    for (const note of low) {
      const overlapping = pitched.filter(
        (other) =>
          other !== note &&
          other.beat < note.beat + note.length &&
          note.beat < other.beat + other.length,
      );
      for (const other of overlapping) {
        const gap = Math.abs(midiOf(other.note) - midiOf(note.note));
        expect(gap === 0 || gap >= 7).toBe(true);
      }
    }
  });

  test("cannot clip the music bus", () => {
    const spans = flattenSong(SONG).map((note) => ({
      from: note.beat,
      to: note.beat + note.length,
      gain: stackGain(note.instrument) * note.velocity,
    }));

    let peak = 0;
    for (let beat = 0; beat < LOOP_BEATS; beat += 0.05) {
      const sum = spans.reduce(
        (total, span) =>
          span.from <= beat && beat < span.to ? total + span.gain : total,
        0,
      );
      peak = Math.max(peak, sum);
    }

    expect(peak).toBeGreaterThan(0.2);
    expect(peak).toBeLessThan(1);
  });

  /**
   * The engine drops any voice past its ceiling. For effects that is a mercy;
   * for the score it would quietly mangle the arrangement, so the busiest
   * district has to stay under the limit with room to spare.
   */
  test("never asks the engine for more voices than it will give", () => {
    const loop = LOOP_BEATS * SECONDS_PER_BEAT;

    const demand = (tier: readonly MusicLayer[]): number => {
      const active = new Set(tier);
      const spans: Array<{ from: number; to: number }> = [];
      for (const note of flattenSong(SONG)) {
        if (!active.has(note.layer)) {
          continue;
        }
        const at = note.beat * SECONDS_PER_BEAT;
        for (const layer of noteLayers(
          note.instrument,
          note.note,
          note.length * SECONDS_PER_BEAT,
          1,
        )) {
          // What the engine actually holds a voice for.
          const life = layer.attack + (layer.hold ?? 0) + layer.release;
          spans.push({ from: at, to: at + life });
          // Tails that cross the loop point stack onto the next downbeat.
          if (at + life > loop) {
            spans.push({ from: at - loop, to: at + life - loop });
          }
        }
      }

      let peak = 0;
      for (let at = 0; at < loop; at += 0.01) {
        const live = spans.reduce(
          (total, span) =>
            span.from <= at && at < span.to ? total + 1 : total,
          0,
        );
        peak = Math.max(peak, live);
      }
      return peak;
    };

    const peaks = DISTRICT_TIERS.map(demand);
    expect(Math.max(...peaks)).toBeLessThan(MAX_MUSIC_VOICES);
    // The finale is the worst case the ceiling has to cover. It only ties the
    // district before it, because the peak instant is the loop point and the
    // hats are far too short to still be ringing there.
    expect(peaks.at(-1)).toBe(Math.max(...peaks));
  });

  test("is not silent: every stem has notes with real gain", () => {
    for (const part of SONG.parts) {
      expect(part.notes.length).toBeGreaterThan(0);
      expect(stackGain(part.instrument)).toBeGreaterThan(0);
      for (const note of part.notes) {
        expect(note.length).toBeGreaterThan(0);
        expect(note.beat).toBeGreaterThanOrEqual(0);
        expect(note.beat).toBeLessThan(LOOP_BEATS);
      }
    }
  });

  /**
   * Without this, adding a district silently clamps it onto the finale's
   * arrangement — the run keeps playing, so nothing looks broken, and the last
   * levels quietly share one tier.
   */
  test("scores every district in the run, and only those", () => {
    expect(DISTRICT_TIERS).toHaveLength(LEVELS.length);
  });

  test("plays a distinct, playable arrangement in every district", () => {
    const known = new Set(SONG.parts.map((part) => part.layer));
    const seen = new Set<string>();

    for (const tier of DISTRICT_TIERS) {
      expect(tier.every((layer) => known.has(layer))).toBe(true);
      expect(new Set(tier).size).toBe(tier.length);
      // The bed never drops out; it is what the other stems sit on.
      expect(tier).toContain("pad");

      // No two districts play the same arrangement, or one of them is wasted.
      const key = [...tier].sort().join("+");
      expect(seen.has(key)).toBe(false);
      seen.add(key);
    }
  });

  /**
   * Eight districts and six stems cannot be a strict +1 each time, and should
   * not be: the run is scored as two waves with one deliberate pull-back, so
   * the finale has somewhere to arrive from. This pins that shape.
   */
  test("builds in two waves around a single pull-back", () => {
    const sizes = DISTRICT_TIERS.map((tier) => tier.length);
    const pullBacks = sizes.flatMap((size, index) =>
      index > 0 && size < sizes[index - 1] ? [index] : [],
    );
    expect(pullBacks).toHaveLength(1);
    const [pullBack] = pullBacks;

    // Both waves climb without pausing: no district repeats the last one's size.
    for (const wave of [sizes.slice(0, pullBack), sizes.slice(pullBack)]) {
      for (const [index, size] of wave.entries()) {
        if (index > 0) {
          expect(size).toBeGreaterThan(wave[index - 1]);
        }
      }
    }

    // The run opens at its sparsest and the second wave outgrows the first.
    expect(sizes[0]).toBe(Math.min(...sizes));
    expect(sizes.at(-1)).toBeGreaterThan(Math.max(...sizes.slice(0, pullBack)));

    // And it climbs past the first peak on a colour the first wave never used,
    // so the back half sounds like a rise rather than a rerun.
    const firstWave = new Set(DISTRICT_TIERS.slice(0, pullBack).flat());
    const held = DISTRICT_TIERS.slice(pullBack)
      .flat()
      .filter((layer) => !firstWave.has(layer));
    expect(held.length).toBeGreaterThan(0);
  });

  test("saves every stem playing at once for the finale", () => {
    const finale = DISTRICT_TIERS.at(-1) ?? [];
    expect([...finale].sort()).toEqual(
      SONG.parts.map((part) => part.layer).sort(),
    );
    // Strictly richer than anywhere else, so the arrival is unmistakable.
    for (const tier of DISTRICT_TIERS.slice(0, -1)) {
      expect(tier.every((layer) => finale.includes(layer))).toBe(true);
      expect(tier.length).toBeLessThan(finale.length);
    }
  });

  test("clamps districts outside the run", () => {
    expect(tierForDistrict(-3)).toEqual(DISTRICT_TIERS[0]);
    expect(tierForDistrict(99)).toEqual(DISTRICT_TIERS.at(-1) ?? []);
    expect(tierForDistrict(LEVELS.length)).toEqual(DISTRICT_TIERS.at(-1) ?? []);
  });
});

describe("note voicing", () => {
  const instrument = {
    voices: [{ source: "sawtooth" as const, gain: 1, cutoff: 800 }],
    gain: 0.5,
    attack: 0.02,
    release: 0.3,
    maxHold: 0.5,
  };

  test("takes the attack out of the written length", () => {
    const [layer] = noteLayers(instrument, "A4", 0.2, 0.5);
    expect(layer.hold).toBeCloseTo(0.18, 6);
    expect(layer.freq).toBeCloseTo(440, 6);
    expect(layer.cutoff).toBe(800);
  });

  test("caps the sustain at the instrument's limit", () => {
    const [layer] = noteLayers(instrument, "A4", 4, 0.5);
    expect(layer.hold).toBeCloseTo(0.48, 6);
  });

  test("never asks for a negative sustain", () => {
    const [layer] = noteLayers(instrument, "A4", 0.005, 0.5);
    expect(layer.hold).toBe(0);
  });
});

describe("the lookahead scheduler", () => {
  let emitted: Array<{ note: ScheduledNote; at: number; level: number }>;
  let sequencer: Sequencer;

  const record = (note: ScheduledNote, at: number, level: number): void => {
    emitted.push({ note, at, level });
  };

  beforeEach(() => {
    emitted = [];
    sequencer = new Sequencer(SONG, record, { lookaheadSeconds: 0.1 });
  });

  test("refuses a song that cannot loop", () => {
    expect(() => new Sequencer({ ...SONG, loopBeats: 0 }, record)).toThrow(
      RangeError,
    );
  });

  test("places notes on the grid however uneven the pump is", () => {
    sequencer.setLayers(["bass", "arp", "lead", "pad"]);
    sequencer.start(10);

    // A deliberately jittery timer: real ones drift by milliseconds.
    for (let at = 10; at < 12; at += 0.017 + (at % 0.011)) {
      sequencer.pump(at);
    }

    expect(emitted.length).toBeGreaterThan(10);
    for (const { note, at } of emitted) {
      expect(at).toBeCloseTo(10 + note.beat * SECONDS_PER_BEAT, 9);
    }
  });

  test("schedules only inside the lookahead window", () => {
    sequencer.setLayers(["bass"]);
    sequencer.start(0);
    sequencer.pump(0);

    // The next eighth note is 0.29s out, well past a 0.1s horizon.
    expect(emitted).toHaveLength(1);
    expect(emitted[0].at).toBe(0);

    sequencer.pump(0.25);
    expect(emitted).toHaveLength(2);
    expect(emitted[1].at).toBeCloseTo(0.5 * SECONDS_PER_BEAT, 9);
  });

  test("loops seamlessly into the next pass", () => {
    sequencer.setLayers(["bass"]);
    sequencer.start(0);
    const loopSeconds = LOOP_BEATS * SECONDS_PER_BEAT;
    for (let at = 0; at < loopSeconds * 2; at += 0.05) {
      sequencer.pump(at);
    }

    const first = emitted.filter(({ at }) => at < loopSeconds);
    const second = emitted.filter(
      ({ at }) => at >= loopSeconds && at < loopSeconds * 2,
    );
    expect(first.length).toBe(64);
    expect(second.length).toBe(64);
    expect(second.map(({ note }) => note.note)).toEqual(
      first.map(({ note }) => note.note),
    );
    // The seam is one beat gap like any other, not a stutter or a hole.
    const gap = second[0].at - first[first.length - 1].at;
    expect(gap).toBeCloseTo(0.5 * SECONDS_PER_BEAT, 9);
  });

  test("fades a new stem in rather than punching it on", () => {
    sequencer.setLayers(["bass"]);
    sequencer.start(0);
    sequencer.pump(0);
    expect(sequencer.levelOf("arp")).toBe(0);

    sequencer.setLayers(["bass", "arp"]);
    for (let at = 0; at <= 0.4; at += 0.05) {
      sequencer.pump(at);
    }
    const early = emitted.filter(({ note }) => note.layer === "arp");
    expect(early.length).toBeGreaterThan(0);
    expect(early[0].level).toBeLessThan(0.4);

    for (let at = 0.4; at <= 3; at += 0.05) {
      sequencer.pump(at);
    }
    expect(sequencer.levelOf("arp")).toBe(1);
  });

  test("fades a dropped stem out and then stops scheduling it", () => {
    sequencer.setLayers(["bass", "arp"]);
    sequencer.start(0);
    for (let at = 0; at <= 2; at += 0.05) {
      sequencer.pump(at);
    }
    expect(sequencer.levelOf("arp")).toBe(1);

    sequencer.setLayers(["bass"]);
    for (let at = 2; at <= 6; at += 0.05) {
      sequencer.pump(at);
    }
    expect(sequencer.levelOf("arp")).toBe(0);

    const late = emitted.filter(
      ({ note, at }) => note.layer === "arp" && at > 4,
    );
    expect(late).toEqual([]);
    expect(
      emitted.some(({ note, at }) => note.layer === "bass" && at > 4),
    ).toBe(true);
  });

  test("switches districts without restarting the loop", () => {
    sequencer.setLayers(tierForDistrict(0));
    sequencer.start(0);
    for (let at = 0; at <= 1; at += 0.05) {
      sequencer.pump(at);
    }
    const position = sequencer.position;

    sequencer.setLayers(tierForDistrict(3));
    sequencer.pump(1.05);

    expect(sequencer.position).toBeGreaterThanOrEqual(position);
    // Same origin: the beat grid never moved.
    for (const { note, at } of emitted) {
      expect(at).toBeCloseTo(note.beat * SECONDS_PER_BEAT, 9);
    }
  });

  test("slides forward instead of dumping a backlog after a stall", () => {
    sequencer.setLayers(["bass", "arp", "pad", "lead"]);
    sequencer.start(0);
    sequencer.pump(0);
    const before = emitted.length;

    // A backgrounded tab: the clock ran for ten seconds, the timer did not.
    sequencer.pump(10);

    const burst = emitted.length - before;
    expect(burst).toBeLessThan(20);
    for (const { at } of emitted.slice(before)) {
      expect(at).toBeGreaterThanOrEqual(10);
    }
  });

  test("schedules nothing while stopped", () => {
    sequencer.setLayers(["bass"]);
    sequencer.start(0);
    sequencer.pump(0);
    const before = emitted.length;

    sequencer.stop();
    sequencer.pump(5);

    expect(emitted).toHaveLength(before);
    expect(sequencer.isRunning).toBe(false);
  });
});

describe("driving the engine", () => {
  /** The engine builds the limiter, then the master, then the music bus. */
  const musicBus = (): FakeGain => context.created[2] as FakeGain;
  const oscillators = (): FakeOscillator[] =>
    context.sources.filter(
      (source): source is FakeOscillator => source instanceof FakeOscillator,
    );

  test("builds no context until the music actually starts", () => {
    const audio = build();
    audio.music.setDistrict(2);
    audio.music.setIdle();

    expect(context.created).toHaveLength(0);
    expect(audio.music.isPlaying()).toBe(false);
  });

  test("wakes on a ~25ms timer and schedules ahead of the clock", () => {
    const audio = build();
    audio.music.start();

    expect(tickIntervalMs).toBe(25);
    expect(audio.music.isPlaying()).toBe(true);
    run(0.5);

    const started = oscillators().map((source) => source.startedAt ?? -1);
    expect(started.length).toBeGreaterThan(0);
    // Every note was placed on the clock, never fired at it.
    expect(Math.min(...started)).toBeGreaterThan(0);
  });

  test("routes every music voice through one bus under the master", () => {
    const audio = build();
    audio.music.start();
    run(0.5);

    const bus = musicBus();
    const master = context.created[1];
    expect(bus.outputs[0]).toBe(master);
    expect(walk(master).at(-1)).toBe(context.destination);

    const voiceGains = context.created.filter(
      (node) => node !== bus && node.outputs[0] === bus,
    );
    expect(voiceGains.length).toBeGreaterThan(0);
    // Nothing from the score reaches the master except through the bus.
    expect(
      context.created.filter((node) => node.outputs[0] === master),
    ).toEqual([bus]);
  });

  test("starts quiet and swells in", () => {
    const audio = build();
    audio.music.start();

    const ramp = musicBus().gain.schedule;
    expect(ramp[0].value).toBeLessThan(MUSIC_LEVEL);
    expect(ramp.at(-1)?.value).toBe(MUSIC_LEVEL);
    expect((ramp.at(-1)?.time ?? 0) - ramp[0].time).toBeGreaterThan(1);
  });

  test("holds a pad note open instead of letting it pip", () => {
    const audio = build();
    audio.music.setIdle();
    audio.music.start();
    run(0.3);

    const held = context.created.filter(
      (node): node is FakeGain =>
        "gain" in node && (node as FakeGain).gain.schedule.length === 4,
    );
    // Silence, peak, sustain, decay: four points, unlike a one-shot's three.
    expect(held.length).toBeGreaterThan(0);
  });

  test("never starves the effects of voices", () => {
    // A five-second horizon crams far more notes in than the ceiling allows.
    const audio = build({ music: { lookaheadSeconds: 5 } });
    audio.music.setDistrict(4);
    audio.music.start();
    run(0.1);

    expect(oscillators().length).toBeLessThanOrEqual(MAX_MUSIC_VOICES);

    const before = context.sources.length;
    audio.play("melee");
    expect(context.sources.length).toBeGreaterThan(before);
  });

  test("stops the timer and fades out when the music stops", () => {
    const audio = build();
    audio.music.start();
    run(0.5);
    const playing = context.sources.length;

    audio.music.stop();

    expect(tick).toBeUndefined();
    expect(audio.music.isPlaying()).toBe(false);
    expect(musicBus().gain.schedule.at(-1)?.value).toBe(0);

    run(1);
    expect(context.sources).toHaveLength(playing);
  });

  test("stops on destroy", () => {
    const audio = build();
    audio.music.start();
    run(0.5);

    audio.destroy();

    expect(tick).toBeUndefined();
    expect(context.closeCalls).toBe(1);
    expect(audio.music.isPlaying()).toBe(false);
  });
});

describe("mute", () => {
  test("plays nothing while muted, and picks up on unmute", () => {
    const audio = build();
    audio.setMuted(true);
    audio.music.start();
    run(0.5);

    expect(context.created).toHaveLength(0);
    expect(audio.music.isPlaying()).toBe(false);

    audio.setMuted(false);
    run(0.5);

    expect(audio.music.isPlaying()).toBe(true);
    expect(context.sources.length).toBeGreaterThan(0);
  });

  test("goes quiet mid-loop and comes back", () => {
    const audio = build();
    audio.music.start();
    run(1);
    const playing = context.sources.length;
    expect(playing).toBeGreaterThan(0);

    audio.setMuted(true);
    run(1);

    expect(audio.music.isPlaying()).toBe(false);
    expect(context.sources).toHaveLength(playing);

    audio.setMuted(false);
    run(1);

    expect(audio.music.isPlaying()).toBe(true);
    expect(context.sources.length).toBeGreaterThan(playing);
  });

  test("honours a mute that was saved last session", () => {
    build().setMuted(true);

    context = new FakeContext();
    const restored = build();
    restored.music.start();
    run(0.5);

    expect(restored.music.isPlaying()).toBe(false);
    expect(context.created).toHaveLength(0);
  });
});

describe("cues", () => {
  const musicBusLevel = (): number =>
    (context.created[2] as FakeGain).gain.schedule.at(-1)?.value ?? -1;

  test("replace the loop rather than playing over it", () => {
    const audio = build();
    audio.music.start();
    run(1);
    const before = context.sources.length;

    audio.music.cue("levelCleared");

    expect(audio.music.isPlaying()).toBe(false);
    expect(tick).toBeUndefined();

    const cued = context.sources.slice(before);
    const voices = CUES.levelCleared.instrument.voices.length;
    expect(cued).toHaveLength(CUES.levelCleared.notes.length * voices);
    // Placed after a gap, so the loop's tail has somewhere to die.
    for (const source of cued) {
      expect(source.startedAt ?? 0).toBeGreaterThan(context.currentTime);
    }
    expect(musicBusLevel()).toBe(MUSIC_LEVEL);
  });

  test("sit clear of the effect they land with", () => {
    // The levelCleared effect sparkles at C5 and up, so the chime tops out there.
    const chime = CUES.levelCleared.notes.map((note) => midiOf(note.note));
    expect(Math.max(...chime)).toBeLessThanOrEqual(midiOf("C5"));

    // The knockedOut effect slides 300Hz down to 40Hz; the sag hangs above it.
    const sag = CUES.knockedOut.notes.map((note) => midiOf(note.note));
    expect(Math.min(...sag)).toBeGreaterThanOrEqual(midiOf("A2"));
    expect(frequencyOf("A2")).toBeGreaterThan(100);
  });

  test("play even on a run that never started the music", () => {
    const audio = build();
    audio.music.cue("knockedOut");

    expect(context.sources.length).toBeGreaterThan(0);
  });

  test("stay silent while muted", () => {
    const audio = build();
    audio.setMuted(true);
    audio.music.cue("knockedOut");

    expect(context.created).toHaveLength(0);
  });
});

describe("graceful degradation", () => {
  test("every music call is a no-op without Web Audio", () => {
    const audio = createAudio({
      createContext: () => undefined,
      now: () => 0,
      music: { timer },
    });

    expect(() => {
      audio.music.start();
      audio.music.setDistrict(4);
      audio.music.setIdle();
      audio.music.cue("levelCleared");
      audio.music.stop();
      audio.destroy();
    }).not.toThrow();
    expect(audio.music.isPlaying()).toBe(false);
  });

  test("survives a pump with the engine gone", () => {
    const music = createMusic(() => undefined, { timer });
    music.start();

    expect(() => tick?.()).not.toThrow();
    expect(music.isPlaying()).toBe(false);
  });
});

/** Follows a node's outgoing connections to the end of the chain. */
const walk = (node: FakeNode): FakeNode[] => {
  const path: FakeNode[] = [];
  let current: FakeNode | undefined = node.outputs[0];
  while (current && !path.includes(current)) {
    path.push(current);
    current = current.outputs[0];
  }
  return path;
};
