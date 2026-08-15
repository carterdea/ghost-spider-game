import {
  afterAll,
  beforeAll,
  beforeEach,
  describe,
  expect,
  test,
} from "bun:test";
import { GlobalRegistrator } from "@happy-dom/global-registrator";
import { detectAudioContext, MAX_VOICES } from "./engine";
import { RECIPES } from "./events";
import { type AudioOptions, createAudio, type GameAudio } from "./index";
import type { MuteStorage } from "./preference";
import {
  asContext,
  FakeBufferSource,
  FakeContext,
  FakeFilter,
  type FakeGain,
  type FakeNode,
} from "./testing/fakeAudioContext";

let context: FakeContext;
let clock: number;
let contextCalls: number;

const build = (options: AudioOptions = {}): GameAudio =>
  createAudio({
    createContext: () => {
      contextCalls += 1;
      return asContext(context);
    },
    now: () => clock,
    ...options,
  });

/** Advances both the throttle clock and the audio clock together. */
const advance = (ms: number): void => {
  clock += ms;
  context.advance(ms / 1000);
};

/**
 * Forces the lazy context into existence and lets its voice finish, so a test
 * can tell the master chain apart from the nodes a later event creates.
 */
const warmUp = (audio: GameAudio): number => {
  audio.play("gadgetCycle");
  advance(1000);
  return context.created.length;
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
  clock = 0;
  contextCalls = 0;
});

describe("graceful degradation", () => {
  test("detects nothing when the host has no Web Audio", () => {
    expect(detectAudioContext({})).toBeUndefined();
  });

  test("treats a throwing constructor as no audio", () => {
    const Broken = function Broken(): never {
      throw new Error("context budget exhausted");
    } as unknown as new () => AudioContext;

    expect(detectAudioContext({ AudioContext: Broken })).toBeUndefined();
  });

  test("prefers the prefixed constructor when it is the only one", () => {
    const found = detectAudioContext({
      webkitAudioContext: FakeContext as unknown as new () => AudioContext,
    });

    expect(found).toBeInstanceOf(FakeContext);
  });

  test("every call is a no-op without a context", () => {
    const audio = createAudio({ createContext: () => undefined, now: () => 0 });

    expect(() => {
      audio.play("jump");
      audio.play("swing", 1);
      audio.setWind(0.7);
      audio.setMuted(true);
      audio.destroy();
    }).not.toThrow();
    expect(audio.isMuted()).toBe(true);
  });
});

describe("autoplay gate", () => {
  test("builds no context at all before the first sound", () => {
    const audio = build();
    audio.setWind(0);
    audio.setMuted(true);
    audio.setMuted(false);

    expect(contextCalls).toBe(0);
    expect(context.created).toHaveLength(0);
  });

  test("builds the context once, on the first event", () => {
    const audio = build();
    audio.play("jump");
    advance(500);
    audio.play("land");

    expect(contextCalls).toBe(1);
  });

  test("resumes a suspended context on the first event", () => {
    const audio = build();
    audio.play("jump");

    expect(context.resumeCalls).toBe(1);
    expect(context.state).toBe("running");
    expect(context.sources.length).toBeGreaterThan(0);
  });

  test("does not resume again once running", () => {
    const audio = build();
    audio.play("jump");
    advance(500);
    audio.play("land");

    expect(context.resumeCalls).toBe(1);
  });

  test("stays muted when the context arrives after the mute", () => {
    const audio = build();
    audio.setMuted(true);
    audio.setWind(0.5);
    audio.play("jump");

    const master = context.created[1] as FakeGain;
    expect(master.gain.value).toBe(0);
    expect(context.sources).toHaveLength(1);
  });
});

describe("throttling", () => {
  test("collapses a burst of one event into a single voice", () => {
    const audio = build();
    for (let index = 0; index < 20; index += 1) {
      audio.play("footstep");
    }

    expect(context.sources).toHaveLength(RECIPES.footstep.layers.length);
  });

  test("lets the same event through once its gap has passed", () => {
    const audio = build();
    audio.play("footstep");
    advance(RECIPES.footstep.minGapMs - 1);
    audio.play("footstep");

    expect(context.sources).toHaveLength(1);

    advance(2);
    audio.play("footstep");

    expect(context.sources).toHaveLength(2);
  });

  test("throttles each event independently", () => {
    const audio = build();
    audio.play("footstep");
    audio.play("jump");
    audio.play("footstep");

    const expected =
      RECIPES.footstep.layers.length + RECIPES.jump.layers.length;
    expect(context.sources).toHaveLength(expected);
  });
});

describe("voice limiting", () => {
  test("stops building voices at the ceiling", () => {
    const audio = build();
    const events = Object.keys(RECIPES) as Array<keyof typeof RECIPES>;
    const layers = events.reduce(
      (total, event) => total + RECIPES[event].layers.length,
      0,
    );
    expect(layers).toBeGreaterThan(MAX_VOICES);

    for (const event of events) {
      audio.play(event);
    }

    expect(context.sources).toHaveLength(MAX_VOICES);
  });

  test("frees the ceiling again once the voices end", () => {
    const audio = build();
    for (const event of Object.keys(RECIPES) as Array<keyof typeof RECIPES>) {
      audio.play(event);
    }
    expect(context.sources).toHaveLength(MAX_VOICES);

    advance(4000);
    audio.play("footstep");

    expect(context.sources).toHaveLength(MAX_VOICES + 1);
  });
});

describe("node lifetime", () => {
  test("disconnects every node of a voice when it ends", () => {
    const audio = build();
    const before = warmUp(audio);
    audio.play("melee");

    const voiceNodes = context.created.slice(before);
    expect(voiceNodes.length).toBeGreaterThan(0);
    expect(voiceNodes.every((node) => node.disconnects === 0)).toBe(true);

    advance(2000);

    expect(voiceNodes.every((node) => node.disconnects === 1)).toBe(true);
  });

  test("routes every voice into the shared master chain", () => {
    const audio = build();
    audio.play("jump");

    const master = context.created[1];
    const reachesMaster = context.sources.every((source) =>
      walk(source).includes(master),
    );
    expect(reachesMaster).toBe(true);
    expect(walk(master).at(-1)).toBe(context.destination);
  });

  test("stops and disconnects live voices on destroy", () => {
    const audio = build();
    const before = warmUp(audio);
    audio.play("knockedOut");
    const voiceNodes = context.created.slice(before);

    audio.destroy();

    expect(context.closeCalls).toBe(1);
    expect(
      context.sources.every((source) => source.stoppedAt !== undefined),
    ).toBe(true);
    expect(voiceNodes.every((node) => node.disconnects === 1)).toBe(true);

    const created = context.sources.length;
    audio.play("jump");
    expect(context.sources).toHaveLength(created);
  });
});

describe("unlocking from a gesture", () => {
  /** A preference that says the player left the game muted last time. */
  const savedMuted: MuteStorage = {
    getItem: () => "1",
    setItem: () => undefined,
  };

  test("a muted game builds nothing and asks to be called again", () => {
    const audio = build({ storage: savedMuted });

    expect(audio.unlock()).toBe(false);
    // Silence stays free: no context is opened for a game making no sound.
    expect(contextCalls).toBe(0);
  });

  test("the gesture after unmuting is the one that opens the context", () => {
    const audio = build({ storage: savedMuted });
    audio.unlock();

    audio.setMuted(false);
    audio.unlock();

    // Without this the context was first built from the frame clock, where a
    // browser enforcing autoplay refuses to start one and the run stays
    // silent for the session.
    expect(contextCalls).toBe(1);
    expect(context.resumeCalls).toBeGreaterThan(0);
  });

  test("it reports live once the context is running, so the caller can let go", () => {
    const audio = build();

    // Asynchronous under a real browser, so the first answer is usually no
    // and the listener survives to the next key.
    audio.unlock();

    expect(audio.unlock()).toBe(true);
  });
});

describe("mute", () => {
  test("builds no voices while muted and resumes after unmuting", () => {
    const audio = build();
    audio.setMuted(true);
    audio.play("jump");

    expect(context.sources).toHaveLength(0);
    expect(audio.isMuted()).toBe(true);

    audio.setMuted(false);
    audio.play("jump");

    expect(context.sources.length).toBeGreaterThan(0);
  });

  test("ramps the master gain down and back up", () => {
    const audio = build({ volume: 0.5 });
    audio.play("jump");
    const master = context.created[1] as FakeGain;
    expect(master.gain.value).toBe(0.5);

    audio.setMuted(true);
    expect(master.gain.value).toBe(0);

    audio.setMuted(false);
    expect(master.gain.value).toBe(0.5);
  });

  test("persists across sessions", () => {
    build().setMuted(true);

    context = new FakeContext();
    const restored = build();

    expect(restored.isMuted()).toBe(true);
    restored.play("jump");
    expect(context.sources).toHaveLength(0);

    restored.setMuted(false);
    context = new FakeContext();
    expect(build().isMuted()).toBe(false);
  });

  test("survives storage that refuses to answer", () => {
    const storage: MuteStorage = {
      getItem: () => {
        throw new Error("denied");
      },
      setItem: () => {
        throw new Error("denied");
      },
    };
    const audio = build({ storage });

    expect(audio.isMuted()).toBe(false);
    expect(() => audio.setMuted(true)).not.toThrow();
    expect(audio.isMuted()).toBe(true);
  });
});

describe("wind bed", () => {
  test("stays unbuilt while the wind is still", () => {
    build().setWind(0);

    expect(context.sources).toHaveLength(0);
  });

  test("builds one looping source and then reuses it", () => {
    const audio = build();
    audio.setWind(0.4);

    expect(context.sources).toHaveLength(1);
    const [source] = context.sources;
    expect(source).toBeInstanceOf(FakeBufferSource);
    expect((source as FakeBufferSource).loop).toBe(true);
    expect(source.stoppedAt).toBeUndefined();

    audio.setWind(0.9);
    expect(context.sources).toHaveLength(1);
  });

  test("moves gain and cutoff with the intensity", () => {
    const audio = build();
    audio.setWind(0.2);
    const filter = findFilter(context);
    const gain = context.created.at(-1) as FakeGain;
    const quiet = gain.gain.schedule.at(-1)?.value ?? 0;
    const dull = filter.frequency.schedule.at(-1)?.value ?? 0;

    audio.setWind(1);

    expect(gain.gain.schedule.at(-1)?.value ?? 0).toBeGreaterThan(quiet);
    expect(filter.frequency.schedule.at(-1)?.value ?? 0).toBeGreaterThan(dull);
  });

  test("outlives the voices that end around it", () => {
    const audio = build();
    audio.setWind(0.6);
    audio.play("jump");
    const [wind] = context.sources;

    advance(3000);

    expect(wind.ended).toBe(false);
    expect(wind.disconnects).toBe(0);
  });
});

describe("intensity", () => {
  test("bends the swing whoosh upward with speed", () => {
    const audio = build();
    audio.play("swing", 0);
    const slow = firstFrequency(context);

    advance(RECIPES.swing.minGapMs + 1);
    audio.play("swing", 1);
    const fast = firstFrequency(context, 1);

    expect(slow).toBe(RECIPES.swing.layers[0].freq);
    expect(fast).toBe(RECIPES.swing.layers[0].freq * 2);
  });

  test("clamps intensity into the 0–1 range", () => {
    const audio = build();
    audio.play("swing", 12);

    expect(firstFrequency(context)).toBe(RECIPES.swing.layers[0].freq * 2);
  });

  test("leaves events without a bend alone", () => {
    const audio = build();
    audio.play("footstep", 1);

    expect(firstFrequency(context)).toBe(RECIPES.footstep.layers[0].freq);
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

const findFilter = (fake: FakeContext): FakeFilter => {
  const filter = fake.created.find((node) => node instanceof FakeFilter);
  if (!filter) {
    throw new Error("no filter was created");
  }
  return filter;
};

/** The band-pass centre scheduled for the nth noise voice. */
const firstFrequency = (fake: FakeContext, index = 0): number => {
  const filters = fake.created.filter((node) => node instanceof FakeFilter);
  const filter = filters[index];
  if (!filter) {
    throw new Error(`no filter at index ${index}`);
  }
  return filter.frequency.schedule[0]?.value ?? 0;
};
