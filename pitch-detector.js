// pitch-detector.js
// YIN pitch detection algorithm
// Reference: de Cheveigné & Kawahara (2002) "YIN, a fundamental frequency estimator"

const YIN_THRESHOLD = 0.15;  // 0.10 was too strict — risks locking onto harmonics on complex/indirect signals
const BUFFER_SIZE   = 4096;  // longer window improves low-note stability
const MIN_FREQ      = 60;    // Hz — below low E2 (82.4 Hz), ignore
const MAX_FREQ      = 1400;  // Hz — above high e4 (329.6 Hz × 4 harmonics)
const ANALYSIS_INTERVAL_MS = 33; // ~30Hz; enough for a tuner and lighter on phones

export class PitchDetector {
  constructor(onPitch) {
    this.onPitch    = onPitch;  // callback: ({ freq, clarity }) => void
    this.context    = null;
    this.analyser   = null;
    this.source     = null;
    this.stream     = null;
    this.buffer     = new Float32Array(BUFFER_SIZE);
    this._rafId     = null;
    this._running   = false;
    this._lastAnalysisAt = 0;
    this._worker    = null;
    this._inFlight  = false;
    this._workerReady = false;
  }

  async start() {
    if (this._running) return;

    this.context = new (window.AudioContext || window.webkitAudioContext)();
    this._lastAnalysisAt = 0;
    this._initWorker();

    let stream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({
        audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: false }
      });
    } catch (err) {
      throw new Error(err.name === 'NotAllowedError'
        ? 'Microphone access denied. Please allow mic access and try again.'
        : 'Could not access microphone: ' + err.message);
    }

    this.stream  = stream;
    this.source  = this.context.createMediaStreamSource(stream);
    this.analyser = this.context.createAnalyser();
    this.analyser.fftSize = BUFFER_SIZE;
    this.source.connect(this.analyser);

    this._running = true;
    this._loop();
  }

  stop() {
    this._running = false;
    if (this._rafId) { cancelAnimationFrame(this._rafId); this._rafId = null; }
    if (this.stream) { this.stream.getTracks().forEach(t => t.stop()); this.stream = null; }
    if (this.context) { this.context.close(); this.context = null; }
    if (this._worker) {
      this._worker.terminate();
      this._worker = null;
    }
    this._inFlight = false;
    this._workerReady = false;
    this._lastAnalysisAt = 0;
  }

  _loop() {
    if (!this._running) return;
    this._rafId = requestAnimationFrame(() => {
      const now = performance.now();
      if (now - this._lastAnalysisAt >= ANALYSIS_INTERVAL_MS && !this._inFlight) {
        this._lastAnalysisAt = now;
        this.analyser.getFloatTimeDomainData(this.buffer);
        const frame = this.buffer.slice();
        if (this._workerReady && this._worker) {
          this._inFlight = true;
          this._worker.postMessage({ type: 'analyze', samples: frame, sampleRate: this.context.sampleRate }, [frame.buffer]);
        } else {
          const result = yin(frame, this.context.sampleRate);
          this.onPitch(result);  // { freq: number | null, clarity: number }
        }
      }
      this._loop();
    });
  }

  _initWorker() {
    if (this._worker) return;
    try {
      this._worker = new Worker(new URL('./pitch-worker.js', import.meta.url), { type: 'module' });
      this._worker.onmessage = event => {
        const msg = event.data;
        if (!msg || msg.type !== 'result') return;
        this._inFlight = false;
        this.onPitch(msg.result);
      };
      this._worker.onerror = () => {
        // Fall back to main-thread analysis if the worker fails.
        if (this._worker) {
          this._worker.terminate();
          this._worker = null;
        }
        this._workerReady = false;
        this._inFlight = false;
      };
      this._workerReady = true;
    } catch {
      this._worker = null;
      this._workerReady = false;
    }
  }
}

// ── YIN implementation ────────────────────────────────────────────────────────

function yin(buffer, sampleRate) {
  const halfLen = Math.floor(buffer.length / 2);
  const yinBuf  = new Float32Array(halfLen);

  // Step 1 — Difference function
  for (let tau = 0; tau < halfLen; tau++) {
    yinBuf[tau] = 0;
    for (let i = 0; i < halfLen; i++) {
      const delta = buffer[i] - buffer[i + tau];
      yinBuf[tau] += delta * delta;
    }
  }

  // Step 2 — Cumulative mean normalized difference
  yinBuf[0] = 1;
  let runningSum = 0;
  for (let tau = 1; tau < halfLen; tau++) {
    runningSum  += yinBuf[tau];
    yinBuf[tau] *= tau / runningSum;
  }

  // Step 3 — Absolute threshold + parabolic interpolation
  const minTau = Math.floor(sampleRate / MAX_FREQ);
  const maxTau = Math.floor(sampleRate / MIN_FREQ);

  for (let tau = minTau; tau < Math.min(maxTau, halfLen - 1); tau++) {
    if (yinBuf[tau] < YIN_THRESHOLD) {
      const betterTau = parabolicInterp(yinBuf, tau);
      return { freq: sampleRate / betterTau, clarity: 1 - yinBuf[tau] };
    }
  }

  return { freq: null, clarity: 0 };
}

function parabolicInterp(buf, tau) {
  const x0 = tau > 0           ? tau - 1 : tau;
  const x2 = tau + 1 < buf.length ? tau + 1 : tau;
  if (x0 === tau) return buf[tau] <= buf[x2] ? tau : x2;
  if (x2 === tau) return buf[tau] <= buf[x0] ? tau : x0;
  const s0 = buf[x0], s1 = buf[tau], s2 = buf[x2];
  return tau + (s2 - s0) / (2 * (2 * s1 - s2 - s0));
}
