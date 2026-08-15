/**
 * A recording stand-in for the Web Audio graph. It keeps the real contract —
 * nodes are created, connected, scheduled, stopped and then fire `onended` —
 * so tests exercise the engine's actual lifecycle rather than a stub of it.
 */

class FakeParam {
  public value: number;
  public readonly schedule: Array<{ value: number; time: number }> = [];

  public constructor(value: number) {
    this.value = value;
  }

  public setValueAtTime(value: number, time: number): FakeParam {
    this.schedule.push({ value, time });
    this.value = value;
    return this;
  }

  public linearRampToValueAtTime(value: number, time: number): FakeParam {
    return this.setValueAtTime(value, time);
  }

  public exponentialRampToValueAtTime(value: number, time: number): FakeParam {
    if (value <= 0) {
      throw new RangeError("exponential ramps cannot reach zero");
    }
    return this.setValueAtTime(value, time);
  }

  public cancelScheduledValues(time: number): FakeParam {
    for (let index = this.schedule.length - 1; index >= 0; index -= 1) {
      if (this.schedule[index].time >= time) {
        this.schedule.splice(index, 1);
      }
    }
    return this;
  }
}

export class FakeNode {
  public readonly outputs: FakeNode[] = [];
  public disconnects = 0;

  public connect(target: FakeNode): FakeNode {
    this.outputs.push(target);
    return target;
  }

  public disconnect(): void {
    this.disconnects += 1;
    this.outputs.length = 0;
  }
}

export class FakeGain extends FakeNode {
  public readonly gain = new FakeParam(1);
}

export class FakeFilter extends FakeNode {
  public type = "lowpass";
  public readonly frequency = new FakeParam(350);
  public readonly Q = new FakeParam(1);
}

class FakeCompressor extends FakeNode {
  public readonly threshold = new FakeParam(-24);
  public readonly ratio = new FakeParam(12);
}

export class FakeSource extends FakeNode {
  public onended: (() => void) | null = null;
  public startedAt?: number;
  public stoppedAt?: number;
  public ended = false;

  public start(time = 0): void {
    this.startedAt = time;
  }

  public stop(time = 0): void {
    if (this.startedAt === undefined) {
      throw new Error("stop before start");
    }
    this.stoppedAt = time;
  }
}

export class FakeOscillator extends FakeSource {
  public type = "sine";
  public readonly frequency = new FakeParam(440);
}

export class FakeBufferSource extends FakeSource {
  public buffer: unknown = null;
  public loop = false;
}

export class FakeContext {
  public currentTime = 0;
  public state: AudioContextState = "suspended";
  public readonly sampleRate = 8000;
  public readonly destination = new FakeNode();
  public readonly created: FakeNode[] = [];
  public readonly sources: FakeSource[] = [];
  public resumeCalls = 0;
  public closeCalls = 0;

  public createGain(): FakeGain {
    return this.track(new FakeGain());
  }

  public createBiquadFilter(): FakeFilter {
    return this.track(new FakeFilter());
  }

  public createDynamicsCompressor(): FakeCompressor {
    return this.track(new FakeCompressor());
  }

  public createOscillator(): FakeOscillator {
    return this.trackSource(new FakeOscillator());
  }

  public createBufferSource(): FakeBufferSource {
    return this.trackSource(new FakeBufferSource());
  }

  public createBuffer(channels: number, length: number, sampleRate: number) {
    const data = new Float32Array(length);
    return {
      length,
      sampleRate,
      numberOfChannels: channels,
      getChannelData: (): Float32Array => data,
    };
  }

  public async resume(): Promise<void> {
    this.resumeCalls += 1;
    this.state = "running";
  }

  public async close(): Promise<void> {
    this.closeCalls += 1;
    this.state = "closed";
  }

  /** Moves the clock forward and ends every voice whose stop time has passed. */
  public advance(seconds: number): void {
    this.currentTime += seconds;
    for (const source of this.sources) {
      if (source.ended || source.stoppedAt === undefined) {
        continue;
      }
      if (source.stoppedAt <= this.currentTime) {
        source.ended = true;
        source.onended?.();
      }
    }
  }

  private track<T extends FakeNode>(node: T): T {
    this.created.push(node);
    return node;
  }

  private trackSource<T extends FakeSource>(node: T): T {
    this.sources.push(node);
    return this.track(node);
  }
}

/** The engine only ever touches the surface `FakeContext` implements. */
export const asContext = (fake: FakeContext): AudioContext =>
  fake as unknown as AudioContext;
