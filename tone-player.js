import { noteToFreq } from "./tuning-data.js";
export { noteToFreq } from "./tuning-data.js";

export class TonePlayer {
  constructor(onStatus = () => {}) {
    this.onStatus = onStatus;
    this.instrument = "acoustic";
    this.volume = 0.65;
    this._ctx = null;
    this._buffers = new Map();
    this._loads = new Map();
    this._sources = new Set();
    this._generation = 0;
    this.soundingUntil = 0;
    this._manifest = null;
  }
  _getContext() {
    if (!this._ctx || this._ctx.state === "closed")
      this._ctx = new (window.AudioContext || window.webkitAudioContext)();
    return this._ctx;
  }
  async _getManifest() {
    if (!this._manifest)
      this._manifest = fetch(new URL("./sample-manifest.json", import.meta.url))
        .then((r) => {
          if (!r.ok) throw new Error("Sound library unavailable");
          return r.json();
        })
        .catch((e) => {
          this._manifest = null;
          throw e;
        });
    return this._manifest;
  }
  async preload() {
    // No AudioContext before a user gesture; defer decoding until a note is tapped.
    try {
      await this._getManifest();
    } catch {}
  }
  stop() {
    const wasPlaying =
      this._sources.size > 0 || this.soundingUntil === Infinity;
    ++this._generation;
    for (const source of this._sources) {
      try {
        source.stop();
      } catch {}
    }
    this._sources.clear();
    this.soundingUntil = performance.now() + (wasPlaying ? 250 : 0);
  }
  async _load(sample, ctx) {
    if (this._buffers.has(sample.file)) return this._buffers.get(sample.file);
    if (!this._loads.has(sample.file)) {
      const load = fetch(new URL(sample.file, import.meta.url))
        .then((r) => {
          if (!r.ok) throw new Error("Recording unavailable");
          return r.arrayBuffer();
        })
        .then((b) => ctx.decodeAudioData(b))
        .then((b) => {
          this._buffers.set(sample.file, b);
          return b;
        })
        .finally(() => this._loads.delete(sample.file));
      this._loads.set(sample.file, load);
    }
    return this._loads.get(sample.file);
  }
  async play(freq, duration = 3) {
    this.stop();
    const generation = this._generation,
      ctx = this._getContext();
    const instrument = this.instrument;
    // Guard the microphone from the click through loading and the full decay.
    this.soundingUntil = Infinity;
    this.onStatus("loading");
    try {
      await ctx.resume();
      if (instrument === "sine") {
        if (generation !== this._generation) return;
        const source = ctx.createOscillator();
        source.type = "sine";
        source.frequency.value = freq;
        this._connect(source, ctx, duration, 0.22);
        this.onStatus("playing");
        return;
      }
      const manifest = await this._getManifest();
      const sample = manifest.banks[instrument].reduce((best, s) =>
        Math.abs(Math.log2(freq / noteToFreq(s.note))) <
        Math.abs(Math.log2(freq / noteToFreq(best.note)))
          ? s
          : best,
      );
      const buffer = await this._load(sample, ctx);
      if (generation !== this._generation) return;
      const source = ctx.createBufferSource();
      source.buffer = buffer;
      // Calibrated recorded pitch, rather than assuming every recording is exact.
      source.playbackRate.value =
        freq / (sample.measuredHz || noteToFreq(sample.note));
      const audible = Math.min(
        duration,
        buffer.duration / source.playbackRate.value,
      );
      this._connect(source, ctx, audible, 0.8);
      this.onStatus("playing");
    } catch (error) {
      if (generation !== this._generation) return;
      this.soundingUntil = performance.now();
      this.onStatus("error");
      throw new Error(
        "The guitar recording could not load. Try again, or choose Pure tone.",
      );
    }
  }
  _connect(source, ctx, duration, level) {
    const gain = ctx.createGain(),
      now = ctx.currentTime,
      peak = level * this.volume;
    gain.gain.setValueAtTime(0, now);
    gain.gain.linearRampToValueAtTime(peak, now + 0.008);
    gain.gain.setValueAtTime(peak, now + Math.max(0.008, duration - 0.16));
    gain.gain.linearRampToValueAtTime(0, now + duration);
    source.connect(gain);
    gain.connect(ctx.destination);
    this._sources.add(source);
    source.onended = () => {
      this._sources.delete(source);
      source.disconnect();
      gain.disconnect();
    };
    source.start();
    source.stop(now + duration);
    this.soundingUntil = performance.now() + duration * 1000 + 300;
  }
  playNote(note, duration = 3, reference = 440) {
    return this.play(noteToFreq(note, reference), duration);
  }
}
