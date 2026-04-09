// tone-player.js
// Plays real acoustic guitar samples (samples/*.mp3).
// Uses Web Audio playbackRate to pitch-shift for alternate tunings.
// Falls back to Karplus-Strong synthesis if a sample fails to load.

// The 6 sample files we have — one per open string in standard tuning
const SAMPLE_NOTES = ['E2', 'A2', 'D3', 'G3', 'B3', 'E4'];

export const NOTE_FREQUENCIES = {
  'C0':16.35,'C#0':17.32,'D0':18.35,'D#0':19.45,'E0':20.60,'F0':21.83,
  'F#0':23.12,'G0':24.50,'G#0':25.96,'A0':27.50,'A#0':29.14,'Bb0':29.14,'B0':30.87,
  'C1':32.70,'C#1':34.65,'D1':36.71,'D#1':38.89,'E1':41.20,'F1':43.65,
  'F#1':46.25,'G1':49.00,'G#1':51.91,'A1':55.00,'A#1':58.27,'Bb1':58.27,'B1':61.74,
  'C2':65.41,'C#2':69.30,'D2':73.42,'D#2':77.78,'E2':82.41,'F2':87.31,
  'F#2':92.50,'G2':98.00,'G#2':103.83,'A2':110.00,'A#2':116.54,'Bb2':116.54,'B2':123.47,
  'C3':130.81,'C#3':138.59,'D3':146.83,'D#3':155.56,'E3':164.81,'F3':174.61,
  'F#3':185.00,'G3':196.00,'G#3':207.65,'Ab3':207.65,'A3':220.00,'A#3':233.08,'Bb3':233.08,'B3':246.94,
  'C4':261.63,'C#4':277.18,'D4':293.66,'D#4':311.13,'E4':329.63,'F4':349.23,
  'F#4':369.99,'Gb3':185.00,'Gb4':369.99,'G4':392.00,'G#4':415.30,'Ab4':415.30,
  'A4':440.00,'A#4':466.16,'Bb4':466.16,'B4':493.88,
  'Db3':138.59,'Db4':277.18,'Eb2':77.78,'Eb4':311.13,'Ab2':103.83,
};

export function noteToFreq(noteStr) {
  if (noteStr in NOTE_FREQUENCIES) return NOTE_FREQUENCIES[noteStr];
  throw new Error(`Unknown note: ${noteStr}`);
}

export class TonePlayer {
  constructor() {
    this._ctx          = null;
    this._buffers      = {}; // noteStr → AudioBuffer
    this._preloadDone  = false;
    this._preloadPromise = null;
  }

  // Call on app init — loads samples in the background before user taps anything
  preload() {
    if (this._preloadPromise) return this._preloadPromise;
    this._preloadPromise = this._loadAll();
    return this._preloadPromise;
  }

  async _loadAll() {
    const ctx = this._getContext();
    await Promise.allSettled(SAMPLE_NOTES.map(async note => {
      try {
        const resp = await fetch(`./samples/${note}.mp3`);
        if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
        const ab = await resp.arrayBuffer();
        this._buffers[note] = await ctx.decodeAudioData(ab);
      } catch (err) {
        console.warn(`Sample ${note} unavailable — will use synthesis fallback`);
      }
    }));
    this._preloadDone = true;
  }

  _getContext() {
    if (!this._ctx || this._ctx.state === 'closed') {
      this._ctx = new (window.AudioContext || window.webkitAudioContext)();
    }
    if (this._ctx.state === 'suspended') this._ctx.resume();
    return this._ctx;
  }

  // Find which of the 6 sample notes is closest in pitch to freq
  _closestSample(freq) {
    let best = null, minDiff = Infinity;
    for (const note of SAMPLE_NOTES) {
      const diff = Math.abs(Math.log2(freq / NOTE_FREQUENCIES[note]));
      if (diff < minDiff) { minDiff = diff; best = note; }
    }
    return best;
  }

  play(freq, duration = 3.0) {
    const ctx = this._getContext();
    const closestNote = this._closestSample(freq);
    const buffer = this._buffers[closestNote];

    if (buffer) {
      // Real sample: pitch-shift via playbackRate
      const playbackRate = freq / NOTE_FREQUENCIES[closestNote];
      const source   = ctx.createBufferSource();
      const gainNode = ctx.createGain();
      source.buffer             = buffer;
      source.playbackRate.value = playbackRate;
      gainNode.gain.setValueAtTime(0.85, ctx.currentTime);
      gainNode.gain.linearRampToValueAtTime(0, ctx.currentTime + duration);
      source.connect(gainNode);
      gainNode.connect(ctx.destination);
      source.start();
      source.stop(ctx.currentTime + duration + 0.1);
    } else {
      // Karplus-Strong fallback if sample not yet loaded or failed
      this._playKS(freq, duration, ctx);
    }
  }

  playNote(noteStr, duration = 3.0) {
    this.play(noteToFreq(noteStr), duration);
  }

  // ── Karplus-Strong fallback ────────────────────────────────────────────────

  _playKS(freq, duration, ctx) {
    const sampleRate  = ctx.sampleRate;
    const delayLength = Math.round(sampleRate / freq);
    const bufLen      = sampleRate * (duration + 0.5);
    const outBuf      = ctx.createBuffer(1, bufLen, sampleRate);
    const data        = outBuf.getChannelData(0);

    const delayLine    = new Float32Array(delayLength);
    const smoothPasses = freq > 250 ? 3 : freq > 150 ? 2 : freq > 100 ? 1 : 0;
    for (let i = 0; i < delayLength; i++) delayLine[i] = Math.random() * 2 - 1;
    for (let p = 0; p < smoothPasses; p++) {
      for (let i = 1; i < delayLength; i++) {
        delayLine[i] = (delayLine[i] + delayLine[i - 1]) * 0.5;
      }
    }

    const damping   = 0.5 * Math.pow(0.001, 1 / (3.2 * freq));
    let   prevSample = 0;
    for (let i = 0; i < bufLen; i++) {
      const idx      = i % delayLength;
      const filtered = damping * (delayLine[idx] + prevSample);
      delayLine[idx] = filtered;
      data[i]        = filtered;
      prevSample     = filtered;
    }
    for (let i = 0; i < bufLen; i++) data[i] = Math.tanh(data[i] * 1.5) * 0.7;
    const attack = Math.floor(sampleRate * 0.003);
    for (let i = 0; i < attack; i++) data[i] *= i / attack;

    const source   = ctx.createBufferSource();
    const gainNode = ctx.createGain();
    source.buffer  = outBuf;
    gainNode.gain.setValueAtTime(0.8, ctx.currentTime);
    gainNode.gain.linearRampToValueAtTime(0, ctx.currentTime + duration);
    source.connect(gainNode);
    gainNode.connect(ctx.destination);
    source.start();
    source.stop(ctx.currentTime + duration + 0.1);
  }
}
