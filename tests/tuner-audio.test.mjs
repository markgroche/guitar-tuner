import test from "node:test";
import assert from "node:assert/strict";
import { PitchAnalysis } from "../pitch-core.js";
import { PitchTracker } from "../pitch-tracker.js";
import {
  TUNINGS,
  noteToFreq,
  noteToMidi,
  closestString,
} from "../tuning-data.js";
const cents = (a, b) => 1200 * Math.log2(a / b);
const signal = (freq, rate, amplitude = 0.3, offset = 0) =>
  Float32Array.from(
    { length: 4096 },
    (_, i) => offset + amplitude * Math.sin((2 * Math.PI * freq * i) / rate),
  );

test("pitch accuracy across guitar range, tuning offsets and sample rates", () => {
  const detector = new PitchAnalysis(),
    errors = [];
  for (const rate of [44100, 48000, 96000])
    for (const note of [
      "A1",
      "C2",
      "D2",
      "E2",
      "A2",
      "D3",
      "G3",
      "B3",
      "E4",
      "F#4",
    ])
      for (const offset of [-25, 0, 25]) {
        const target = noteToFreq(note) * 2 ** (offset / 1200),
          result = detector.analyze(signal(target, rate), rate);
        assert.ok(result.freq, `${note} ${rate}: missing pitch`);
        errors.push(Math.abs(cents(result.freq, target)));
        assert.ok(errors.at(-1) < 1, `${note} ${rate}: ${errors.at(-1)} cents`);
      }
  console.log(
    `90 synthetic tones: max error ${Math.max(...errors).toFixed(4)} cents`,
  );
});
test("silence, near-silence, DC and clipping do not produce a valid pitch", () => {
  const detector = new PitchAnalysis();
  for (const frame of [
    new Float32Array(4096),
    signal(110, 48000, 1e-8),
    new Float32Array(4096).fill(0.2),
    signal(110, 48000, 1.1),
  ])
    assert.equal(detector.analyze(frame, 48000).freq, null);
});
test("a harmonic-rich pluck and a moderate noisy tone keep their fundamental", () => {
  const detector = new PitchAnalysis();
  for (const note of ["E2", "A2", "E4"]) {
    const f = noteToFreq(note);
    const frame = Float32Array.from(
      { length: 4096 },
      (_, i) =>
        Math.exp(-i / 18000) *
        (0.13 * Math.sin((2 * Math.PI * f * i) / 48000) +
          0.24 * Math.sin((4 * Math.PI * f * i) / 48000) +
          0.08 * Math.sin((6 * Math.PI * f * i) / 48000)),
    );
    const r = detector.analyze(frame, 48000);
    assert.ok(r.freq);
    assert.ok(Math.abs(cents(r.freq, f)) < 2, `${note}: ${r.freq}`);
  }
  let seed = 42;
  const noise = () => {
    seed = (Math.imul(1664525, seed) + 1013904223) >>> 0;
    return (seed / 2 ** 32) * 2 - 1;
  };
  const white = Float32Array.from({ length: 4096 }, () => noise() * 0.1);
  assert.equal(detector.analyze(white, 48000).freq, null);
  const noisy = signal(110, 48000);
  for (let i = 0; i < noisy.length; i++) noisy[i] += noise() * 0.02;
  const r = detector.analyze(noisy, 48000);
  assert.ok(Math.abs(cents(r.freq, 110)) < 2);
});
test("every preset resolves six notes, including flat names, and Drop D keeps distant pitches", () => {
  assert.equal(TUNINGS.length, 20);
  for (const p of TUNINGS) {
    assert.equal(p.strings.length, 6);
    for (const n of p.strings)
      assert.ok(noteToFreq(n) >= 40 && noteToFreq(n) <= 1400);
  }
  assert.equal(noteToMidi("Eb3"), noteToMidi("D#3"));
  assert.equal(noteToMidi("B#2"), noteToMidi("C3"));
  assert.throws(() => noteToFreq("potato"));
  const drop = TUNINGS.find((p) => p.name === "Drop D");
  const r = closestString(noteToFreq("E2"), drop);
  assert.equal(r.idx, 0);
  assert.ok(Math.abs(r.cents - 200) < 1e-8);
});
test("confirmation requires elapsed time and resets on loss, target change or a string jump", () => {
  const t = new PitchTracker(),
    offset = (f) => cents(f, 110);
  assert.equal(t.update(110, "A", offset, 0).confirmed, false);
  assert.equal(t.update(110, "A", offset, 100).confirmed, false);
  assert.equal(t.update(110, "A", offset, 301).confirmed, false); // >200 ms gap restarts acquisition
  assert.equal(t.update(110, "A", offset, 401).confirmed, false);
  assert.equal(t.update(110, "A", offset, 501).confirmed, false);
  assert.equal(t.update(110, "A", offset, 601).confirmed, true);
  t.lost();
  assert.equal(t.update(110, "A", offset, 640).confirmed, false);
  assert.equal(t.update(110, "other", offset, 680).confirmed, false);
  const jump = t.update(220, "E", (f) => cents(f, 220), 720);
  assert.ok(Math.abs(jump.cents) < 1e-8);
  assert.equal(jump.confirmed, false);
});
