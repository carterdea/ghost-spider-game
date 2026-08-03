import { describe, expect, test } from "bun:test";
import { asScene, SceneDouble } from "../testing/sceneDouble";
import { Particles } from "./Particles";

const FRAME_MS = 1000 / 60;

/** Runs `ms` of simulation in frames of `frameMs`. */
const run = (particles: Particles, ms: number, frameMs = FRAME_MS): void => {
  for (let elapsed = 0; elapsed < ms; elapsed += frameMs) {
    particles.update(frameMs);
  }
};

describe("Particles", () => {
  test("draws into one graphic that survives every burst", () => {
    const scene = new SceneDouble();
    const particles = new Particles(asScene(scene));

    particles.dust(100, 200, 1);
    particles.spark(140, 220, 1);
    run(particles, 100);

    expect(scene.liveObjects()).toHaveLength(1);
  });

  test("motes retire on their own, and stay retired", () => {
    const scene = new SceneDouble();
    const particles = new Particles(asScene(scene));

    particles.dust(100, 200, 1);
    // Longer than the longest dust life.
    run(particles, 1200);

    // Nothing left to integrate: a frame with no bursts is free.
    expect(particles.liveCount).toBe(0);
    run(particles, 200);
    expect(particles.liveCount).toBe(0);
  });

  test("a harder landing throws more dust than a softer one", () => {
    const scene = new SceneDouble();
    const soft = new Particles(asScene(scene));
    const hard = new Particles(asScene(scene));

    soft.dust(0, 0, 0);
    hard.dust(0, 0, 1);

    expect(hard.liveCount).toBeGreaterThan(soft.liveCount);
  });

  test("a burst is capped, so a runaway caller cannot grow the pool", () => {
    const scene = new SceneDouble();
    const particles = new Particles(asScene(scene));

    for (let burst = 0; burst < 200; burst += 1) {
      particles.spark(0, 0, 1);
    }

    expect(particles.liveCount).toBeLessThanOrEqual(220);
  });

  test("motes travel the same distance at any frame rate", () => {
    const sixty = new Particles(asScene(new SceneDouble()));
    const oneTwenty = new Particles(asScene(new SceneDouble()));

    sixty.dust(0, 0, 1);
    oneTwenty.dust(0, 0, 1);
    run(sixty, 200, 1000 / 60);
    run(oneTwenty, 200, 1000 / 120);

    // Same elapsed time, so the same fraction of every mote's life is spent.
    expect(oneTwenty.liveCount).toBe(sixty.liveCount);
  });

  test("ignores a dead frame rather than integrating a NaN", () => {
    const particles = new Particles(asScene(new SceneDouble()));
    particles.spark(0, 0, 1);
    const before = particles.liveCount;

    for (const delta of [Number.NaN, 0, -16]) {
      particles.update(delta);
    }

    expect(particles.liveCount).toBe(before);
  });

  test("reset empties the pool but keeps the emitter usable", () => {
    const scene = new SceneDouble();
    const particles = new Particles(asScene(scene));
    particles.dust(0, 0, 1);

    particles.reset();
    expect(particles.liveCount).toBe(0);

    particles.dust(0, 0, 1);
    expect(particles.liveCount).toBeGreaterThan(0);
    expect(scene.liveObjects()).toHaveLength(1);
  });

  test("destroy takes the graphic with it", () => {
    const scene = new SceneDouble();
    const particles = new Particles(asScene(scene));
    particles.dust(0, 0, 1);

    particles.destroy();

    expect(scene.liveObjects()).toHaveLength(0);
    expect(particles.liveCount).toBe(0);
  });
});
