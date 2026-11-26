import test from "node:test";
import assert from "node:assert/strict";
import { PitchDetector } from "../pitch-detector.js";

function setup(getUserMedia) {
  const contexts = [];
  class Context {
    constructor() {
      this.state = "suspended";
      this.sampleRate = 48000;
      this.closed = 0;
      contexts.push(this);
    }
    async resume() {
      this.state = "running";
    }
    async close() {
      this.state = "closed";
      this.closed++;
    }
    addEventListener() {}
    createMediaStreamSource() {
      return { connect() {}, disconnect() {} };
    }
    createAnalyser() {
      return {
        disconnect() {},
        getFloatTimeDomainData(a) {
          a.fill(0);
        },
      };
    }
  }
  Object.defineProperty(globalThis, "navigator", {
    value: { mediaDevices: { getUserMedia } },
    configurable: true,
  });
  globalThis.window = { AudioContext: Context };
  return contexts;
}
function stream() {
  const track = {
    stopped: 0,
    stop() {
      this.stopped++;
    },
    getSettings() {
      return { echoCancellation: false };
    },
    addEventListener() {},
  };
  return {
    track,
    getTracks() {
      return [track];
    },
    getAudioTracks() {
      return [track];
    },
  };
}

test("double-start shares a capture request and stop releases its track/context", async () => {
  let requests = 0;
  const input = stream();
  const contexts = setup(async () => {
    requests++;
    return input;
  });
  const detector = new PitchDetector(() => {});
  const a = detector.start(),
    b = detector.start();
  assert.equal(a, b);
  await a;
  assert.equal(requests, 1);
  assert.equal(contexts.length, 1);
  assert.equal(detector._running, true);
  detector.stop();
  assert.equal(input.track.stopped, 1);
  assert.equal(contexts[0].state, "closed");
  assert.equal(detector._timer, null);
});
test("denied permission closes the context and allows a later retry", async () => {
  let requests = 0;
  const input = stream();
  const contexts = setup(async () => {
    if (++requests === 1)
      throw Object.assign(new Error("blocked"), { name: "NotAllowedError" });
    return input;
  });
  const detector = new PitchDetector(() => {});
  await assert.rejects(detector.start(), /Microphone access is blocked/);
  assert.equal(contexts[0].state, "closed");
  assert.equal(detector._starting, null);
  assert.equal(detector._running, false);
  await detector.start();
  assert.equal(detector._running, true);
  detector.stop();
});
test("stopping during a pending permission request releases a late stream", async () => {
  let resolve;
  const input = stream();
  const contexts = setup(
    () =>
      new Promise((r) => {
        resolve = r;
      }),
  );
  const detector = new PitchDetector(() => {});
  const pending = detector.start();
  await Promise.resolve();
  detector.stop();
  resolve(input);
  await pending;
  assert.equal(input.track.stopped, 1);
  assert.equal(contexts[0].state, "closed");
  assert.equal(detector._running, false);
  assert.equal(detector._timer, null);
});
