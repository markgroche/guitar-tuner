// Smooth in logarithmic pitch space. Never average two different strings together.
export class PitchTracker {
  constructor() {
    this.reset();
  }
  reset() {
    this.history = [];
    this.smoothed = null;
    this.lastAt = 0;
    this.stableSince = null;
    this.target = null;
  }
  update(freq, targetKey, centsFrom, now) {
    const pitch = 1200 * Math.log2(freq);
    if (
      this.target !== targetKey ||
      now - this.lastAt > 200 ||
      this.smoothed === null ||
      Math.abs(pitch - this.smoothed) > 90
    ) {
      this.history = [];
      this.smoothed = pitch;
      this.stableSince = null;
    }
    this.target = targetKey;
    this.lastAt = now;
    this.history.push(pitch);
    if (this.history.length > 3) this.history.shift();
    const ordered = [...this.history].sort((a, b) => a - b),
      median = ordered[Math.floor(ordered.length / 2)];
    this.smoothed += 0.4 * (median - this.smoothed);
    const smoothedFreq = 2 ** (this.smoothed / 1200),
      cents = centsFrom(smoothedFreq);
    // Confirmation uses the unsmoothed measurement too, so smoothing cannot create success.
    const within = Math.abs(cents) <= 5 && Math.abs(centsFrom(freq)) <= 5;
    if (!within) this.stableSince = null;
    else if (this.stableSince === null) this.stableSince = now;
    return {
      freq: smoothedFreq,
      cents,
      confirmed: within && now - this.stableSince >= 300,
    };
  }
  lost() {
    this.stableSince = null;
  }
}
