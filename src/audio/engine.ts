import { clamp } from "../game/simulation/physics/vector";
import type { Layer } from "./events";

/** Hard ceiling on simultaneous voices, so a firefight cannot become a roar. */
export const MAX_VOICES = 16;

/**
 * Music gets its own ceiling and its own bus. Effects therefore never lose a
 * voice to the score, and a dense bar never crowds out a punch.
 *
 * Unlike the effects, the score's demand is known: the finale peaks at thirty
 * voices where the loop's tails overlap the downbeat. This is headroom over
 * that, not a mix decision — hitting it would drop notes, and a test pins the
 * arrangement below it.
 */
export const MAX_MUSIC_VOICES = 48;

/** The music bus sits this far under the effects, so the score stays bedding. */
export const MUSIC_LEVEL = 0.45;

const DEFAULT_LOWPASS_Q = 0.7;

/** Exponential ramps cannot reach zero; this is close enough to inaudible. */
const SILENCE = 0.0001;
const MIN_ATTACK = 0.001;
const MIN_RAMP = 0.001;

const WIND_MAX_GAIN = 0.07;
const WIND_MIN_CUTOFF = 320;
const WIND_CUTOFF_RANGE = 1200;
const WIND_RAMP = 0.35;

const MUTE_RAMP = 0.08;
const NOISE_SECONDS = 2;

/** The shape of the global object we probe for a Web Audio constructor. */
export interface WebAudioScope {
  AudioContext?: new () => AudioContext;
  /** Older Safari. Still shipping on plenty of iPads. */
  webkitAudioContext?: new () => AudioContext;
}

/**
 * Returns a fresh context, or `undefined` when the host has no Web Audio at
 * all (unit tests, locked-down browsers). Construction itself can throw when a
 * page has exhausted its context budget, which is also just "no audio".
 */
export const detectAudioContext = (
  scope: WebAudioScope = globalThis,
): AudioContext | undefined => {
  const Ctor = scope.AudioContext ?? scope.webkitAudioContext;
  if (!Ctor) {
    return undefined;
  }
  try {
    return new Ctor();
  } catch {
    return undefined;
  }
};

interface Wind {
  source: AudioBufferSourceNode;
  filter: BiquadFilterNode;
  gain: GainNode;
}

/** A source and the nodes it owns, keyed so `onended` can free them. */
type VoiceMap = Map<AudioScheduledSourceNode, AudioNode[]>;

/**
 * Owns the audio graph: a master gain into a soft limiter, one short-lived
 * voice per triggered layer, an optional looping wind bed, and a music bus
 * hanging off the same master so the score shares the mute and the volume.
 *
 * Every voice is driven by its source node's `onended`, so nodes disconnect
 * themselves the moment they stop and the voice count never drifts.
 */
export class AudioEngine {
  private readonly context: AudioContext;
  private readonly master: GainNode;
  private readonly live: VoiceMap = new Map();
  private readonly musicLive: VoiceMap = new Map();
  private readonly volume: number;
  private noise?: AudioBuffer;
  private wind?: Wind;
  private music?: GainNode;
  private muted = false;
  private destroyed = false;

  public constructor(context: AudioContext, volume: number) {
    this.context = context;
    this.volume = volume;

    const limiter = context.createDynamicsCompressor();
    limiter.threshold.value = -12;
    limiter.ratio.value = 12;
    limiter.connect(context.destination);

    this.master = context.createGain();
    this.master.gain.value = volume;
    this.master.connect(limiter);
  }

  public get voiceCount(): number {
    return this.live.size;
  }

  public get musicVoiceCount(): number {
    return this.musicLive.size;
  }

  /** The clock the music scheduler aligns its lookahead window to. */
  public get currentTime(): number {
    return this.context.currentTime;
  }

  /** `bend` multiplies every layer frequency; 1 is the recipe as written. */
  public play(layers: readonly Layer[], bend: number): void {
    if (this.destroyed || this.muted) {
      return;
    }
    this.resume();

    const start = this.context.currentTime;
    for (const layer of layers) {
      if (this.live.size >= MAX_VOICES) {
        return;
      }
      this.startLayer(layer, bend, start, this.master, this.live);
    }
  }

  /**
   * Starts one music voice stack at an absolute context time. The caller is a
   * lookahead scheduler, so `at` is deliberately in the near future rather than
   * `currentTime`; that is what keeps the beat off the frame clock.
   */
  public scheduleMusic(layers: readonly Layer[], at: number): void {
    if (this.destroyed || this.muted) {
      return;
    }
    this.resume();

    const bus = this.musicBus();
    for (const layer of layers) {
      if (this.musicLive.size >= MAX_MUSIC_VOICES) {
        return;
      }
      this.startLayer(layer, 1, at, bus, this.musicLive);
    }
  }

  /**
   * Rides the music sub-mix between 0 and `MUSIC_LEVEL`, for fades in and out.
   * `from` lets a caller line the ramp up with notes it has already scheduled.
   */
  public setMusicLevel(
    level: number,
    seconds: number,
    from = this.context.currentTime,
  ): void {
    if (this.destroyed) {
      return;
    }
    const bus = this.musicBus();
    bus.gain.cancelScheduledValues(from);
    bus.gain.setValueAtTime(bus.gain.value, from);
    bus.gain.linearRampToValueAtTime(level, from + Math.max(seconds, MIN_RAMP));
  }

  /**
   * Cuts every music voice that has been scheduled, including notes placed
   * seconds into the future. Fading the bus is how the score normally leaves;
   * this is for a run being torn down, where an end-of-run cue would otherwise
   * keep ringing under the next run's loop.
   */
  public stopScheduledMusic(): void {
    if (this.destroyed) {
      return;
    }
    stopAll(this.musicLive);
  }

  /** `intensity` is 0–1: how hard the air is moving past the hero. */
  public setWind(intensity: number): void {
    if (this.destroyed) {
      return;
    }
    const level = clamp(intensity, 0, 1);
    if (!this.wind) {
      if (level <= 0) {
        return;
      }
      this.wind = this.startWind();
    }

    const at = this.context.currentTime + WIND_RAMP;
    this.wind.gain.gain.linearRampToValueAtTime(WIND_MAX_GAIN * level, at);
    this.wind.filter.frequency.linearRampToValueAtTime(
      WIND_MIN_CUTOFF + WIND_CUTOFF_RANGE * level,
      at,
    );
  }

  /** Muting ramps the master down, which silences the wind bed too. */
  public setMuted(muted: boolean): void {
    this.muted = muted;
    if (this.destroyed) {
      return;
    }
    this.master.gain.linearRampToValueAtTime(
      muted ? 0 : this.volume,
      this.context.currentTime + MUTE_RAMP,
    );
  }

  public destroy(): void {
    if (this.destroyed) {
      return;
    }
    this.destroyed = true;

    for (const live of [this.live, this.musicLive]) {
      stopAll(live);
    }

    if (this.music) {
      disconnectAll([this.music]);
      this.music = undefined;
    }

    if (this.wind) {
      stopNow(this.wind.source);
      disconnectAll([this.wind.source, this.wind.filter, this.wind.gain]);
      this.wind = undefined;
    }

    disconnectAll([this.master]);
    void this.context.close().catch(() => undefined);
  }

  /**
   * Browsers hold new contexts suspended until a user gesture. Resuming
   * outside one is simply refused, so the rejection is expected and ignored.
   */
  private resume(): void {
    if (this.context.state !== "suspended") {
      return;
    }
    void this.context.resume().catch(() => undefined);
  }

  private startLayer(
    layer: Layer,
    bend: number,
    start: number,
    destination: AudioNode,
    live: VoiceMap,
  ): void {
    const context = this.context;
    const at = start + (layer.delay ?? 0);
    const attack = Math.max(layer.attack, MIN_ATTACK);
    const hold = layer.hold ?? 0;
    const peak = at + attack;
    const end = peak + hold + layer.release;
    const from = layer.freq * bend;
    const to = (layer.glide ?? layer.freq) * bend;

    const gain = context.createGain();
    gain.gain.setValueAtTime(0, at);
    gain.gain.linearRampToValueAtTime(layer.gain, peak);
    if (hold > 0) {
      gain.gain.setValueAtTime(layer.gain, peak + hold);
    }
    gain.gain.exponentialRampToValueAtTime(SILENCE, end);
    gain.connect(destination);

    const { source, extra } = this.createSource(layer, from, to, at, end);
    connectChain([source, ...extra, gain]);

    const owned = [...extra, gain];
    source.onended = () => this.release(live, source, owned);
    live.set(source, owned);
    source.start(at);
    source.stop(end);
  }

  private createSource(
    layer: Layer,
    from: number,
    to: number,
    at: number,
    end: number,
  ): { source: AudioScheduledSourceNode; extra: AudioNode[] } {
    if (layer.source !== "noise") {
      const oscillator = this.context.createOscillator();
      oscillator.type = layer.source;
      glide(oscillator.frequency, from, to, at, end);
      if (layer.cutoff === undefined) {
        return { source: oscillator, extra: [] };
      }
      const lowpass = this.context.createBiquadFilter();
      lowpass.type = "lowpass";
      lowpass.frequency.value = layer.cutoff;
      lowpass.Q.value = layer.q ?? DEFAULT_LOWPASS_Q;
      return { source: oscillator, extra: [lowpass] };
    }

    const source = this.context.createBufferSource();
    source.buffer = this.noiseBuffer();
    source.loop = true;

    const filter = this.context.createBiquadFilter();
    filter.type = "bandpass";
    filter.Q.value = layer.q ?? 1;
    glide(filter.frequency, from, to, at, end);
    return { source, extra: [filter] };
  }

  private release(
    live: VoiceMap,
    source: AudioScheduledSourceNode,
    nodes: AudioNode[],
  ): void {
    if (!live.delete(source)) {
      return;
    }
    disconnectAll([source, ...nodes]);
  }

  /**
   * One sub-mix for every music voice, built on first use so a run that never
   * starts the score never creates it. It opens silent: `setMusicLevel` is the
   * only thing that makes the score audible, so every entrance is a fade.
   */
  private musicBus(): GainNode {
    if (this.music) {
      return this.music;
    }
    const bus = this.context.createGain();
    bus.gain.value = 0;
    bus.connect(this.master);
    this.music = bus;
    return bus;
  }

  private startWind(): Wind {
    const context = this.context;
    const source = context.createBufferSource();
    source.buffer = this.noiseBuffer();
    source.loop = true;

    const filter = context.createBiquadFilter();
    filter.type = "lowpass";
    filter.Q.value = 0.6;
    filter.frequency.value = WIND_MIN_CUTOFF;

    const gain = context.createGain();
    gain.gain.value = 0;

    connectChain([source, filter, gain, this.master]);
    source.start();
    return { source, filter, gain };
  }

  /** One shared white-noise buffer backs every hiss, whoosh and gust. */
  private noiseBuffer(): AudioBuffer {
    if (this.noise) {
      return this.noise;
    }
    const rate = this.context.sampleRate;
    const buffer = this.context.createBuffer(1, rate * NOISE_SECONDS, rate);
    const samples = buffer.getChannelData(0);
    for (let index = 0; index < samples.length; index += 1) {
      samples[index] = Math.random() * 2 - 1;
    }
    this.noise = buffer;
    return buffer;
  }
}

const glide = (
  param: AudioParam,
  from: number,
  to: number,
  at: number,
  end: number,
): void => {
  param.setValueAtTime(from, at);
  if (to !== from) {
    param.exponentialRampToValueAtTime(Math.max(to, 1), end);
  }
};

const connectChain = (nodes: AudioNode[]): void => {
  for (let index = 0; index < nodes.length - 1; index += 1) {
    nodes[index].connect(nodes[index + 1]);
  }
};

const disconnectAll = (nodes: AudioNode[]): void => {
  for (const node of nodes) {
    node.disconnect();
  }
};

/** Silences every voice in a map now, and forgets all of them. */
const stopAll = (live: VoiceMap): void => {
  for (const [source, nodes] of live) {
    source.onended = null;
    stopNow(source);
    disconnectAll([source, ...nodes]);
  }
  live.clear();
};

/** A source that never started, or already stopped, throws on `stop`. */
const stopNow = (source: AudioScheduledSourceNode): void => {
  try {
    source.stop();
  } catch {
    return;
  }
};
