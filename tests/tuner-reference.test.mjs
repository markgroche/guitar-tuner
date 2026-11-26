import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { TonePlayer } from "../tone-player.js";
import { noteToFreq, TUNINGS } from "../tuning-data.js";
const root = new URL("../", import.meta.url);
const manifest = JSON.parse(
  await readFile(new URL("sample-manifest.json", root), "utf8"),
);

test("all recorded voices have calibrated MP3 assets and useful pitch coverage", async () => {
  assert.equal(Object.keys(manifest.banks).length, 3);
  for (const samples of Object.values(manifest.banks)) {
    assert.ok(samples.length >= 10);
    for (const sample of samples) {
      const bytes = await readFile(new URL(sample.file, root));
      assert.ok(bytes.length > 1000);
      assert.ok(sample.measuredHz > 40 && sample.measuredHz < 1400);
      assert.ok(
        Math.abs(
          1200 * Math.log2(sample.measuredHz / noteToFreq(sample.note)),
        ) < 10,
      );
    }
    for (const preset of TUNINGS)
      for (const note of preset.strings) {
        const nearest = samples.reduce((best, s) =>
          Math.abs(Math.log2(noteToFreq(note) / noteToFreq(s.note))) <
          Math.abs(Math.log2(noteToFreq(note) / noteToFreq(best.note)))
            ? s
            : best,
        );
        const correction = noteToFreq(note) / nearest.measuredHz;
        assert.ok(Number.isFinite(correction) && correction > 0);
      }
  }
});
function fakeContext() {
  const sources = [];
  const context = {
    state: "running",
    currentTime: 0,
    async resume() {},
    destination: {},
    async decodeAudioData() {
      return { duration: 4 };
    },
    createBufferSource() {
      const s = {
        playbackRate: { value: 1 },
        connect() {},
        disconnect() {},
        start() {
          this.started = true;
        },
        stop() {
          this.stopped = true;
        },
      };
      sources.push(s);
      return s;
    },
    createOscillator() {
      const s = this.createBufferSource();
      s.frequency = { value: 0 };
      return s;
    },
    createGain() {
      return {
        gain: { setValueAtTime() {}, linearRampToValueAtTime() {} },
        connect() {},
        disconnect() {},
      };
    },
  };
  return { context, sources };
}
test("reference playback compensates for measured sample pitch and stop releases sources", async () => {
  const { context, sources } = fakeContext();
  const player = new TonePlayer();
  player._ctx = context;
  player._manifest = Promise.resolve(manifest);
  const sample = manifest.banks.acoustic.find((s) => s.note === "G2");
  player._buffers.set(sample.file, { duration: 4 });
  await player.play(noteToFreq("G2"));
  assert.equal(sources.length, 1);
  assert.equal(sources[0].started, true);
  assert.equal(
    sources[0].playbackRate.value,
    noteToFreq("G2") / sample.measuredHz,
  );
  assert.ok(player.soundingUntil > performance.now());
  player.stop();
  assert.equal(sources[0].stopped, true);
});
test("stopping during a recording load prevents late playback and resumes microphone eligibility", async () => {
  const { context, sources } = fakeContext();
  const player = new TonePlayer();
  player._ctx = context;
  let resolve;
  player._manifest = new Promise((r) => {
    resolve = r;
  });
  const pending = player.play(110);
  await Promise.resolve();
  assert.equal(player.soundingUntil, Infinity);
  player.stop();
  for (const sample of manifest.banks.acoustic)
    player._buffers.set(sample.file, { duration: 4 });
  resolve(manifest);
  await pending;
  assert.equal(sources.length, 0);
  assert.ok(Number.isFinite(player.soundingUntil));
});
