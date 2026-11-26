import { PitchDetector as McLeodDetector } from "./vendor/pitchy.js";
export class PitchAnalysis {
  constructor(length = 4096) {
    this.detector = McLeodDetector.forFloat32Array(length);
    this.detector.clarityThreshold = 0.9;
    this.detector.minVolumeAbsolute = 0; // RMS gate below owns sensitivity.
    this.centered = new Float32Array(length);
  }
  analyze(samples, sampleRate, { minRms = 0.002, minClarity = 0.9 } = {}) {
    let mean = 0,
      clipped = 0;
    for (const v of samples) {
      mean += v;
      if (Math.abs(v) >= 0.98) clipped++;
    }
    mean /= samples.length;
    let energy = 0;
    for (let i = 0; i < samples.length; i++) {
      this.centered[i] = samples[i] - mean;
      energy += this.centered[i] ** 2;
    }
    const rms = Math.sqrt(energy / samples.length),
      levelDb = 20 * Math.log10(Math.max(rms, 1e-10));
    const base = { rms, levelDb, clarity: 0, freq: null };
    if (clipped / samples.length > 0.01) return { ...base, reason: "clipping" };
    if (rms < minRms) return { ...base, reason: "quiet" };
    const [freq, clarity] = this.detector.findPitch(this.centered, sampleRate);
    if (
      !Number.isFinite(freq) ||
      freq < 40 ||
      freq > 1400 ||
      clarity < minClarity
    )
      return {
        ...base,
        clarity: Number.isFinite(clarity) ? clarity : 0,
        reason: "uncertain",
      };
    return { ...base, freq, clarity, reason: "pitch" };
  }
}
