import { PitchAnalysis } from "./pitch-core.js";
export class PitchDetector {
  constructor(onPitch, onState = () => {}) {
    Object.assign(this, {
      onPitch,
      onState,
      context: null,
      stream: null,
      _running: false,
      _starting: null,
      _generation: 0,
      _worker: null,
      _inFlight: false,
      _timer: null,
    });
    this.buffer = new Float32Array(4096);
    this.analysis = new PitchAnalysis(this.buffer.length);
    this.options = { minRms: 0.002, minClarity: 0.9 };
    this.settings = {};
  }
  start(deviceId = "") {
    if (this._starting) return this._starting;
    if (this._running) return Promise.resolve();
    const generation = ++this._generation;
    this._starting = this._start(deviceId, generation).finally(() => {
      if (generation === this._generation) this._starting = null;
    });
    return this._starting;
  }
  async _start(deviceId, generation) {
    if (!navigator.mediaDevices?.getUserMedia)
      throw new Error(
        "Microphone tuning needs HTTPS or localhost and a browser with audio capture.",
      );
    let context, stream;
    try {
      context = new (window.AudioContext || window.webkitAudioContext)({
        latencyHint: "interactive",
      });
      await context.resume();
      stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          channelCount: { ideal: 1 },
          echoCancellation: false,
          noiseSuppression: false,
          autoGainControl: false,
          ...(deviceId ? { deviceId: { exact: deviceId } } : {}),
        },
      });
      if (generation !== this._generation) {
        stream.getTracks().forEach((t) => t.stop());
        await context.close();
        return;
      }
      this.context = context;
      this.stream = stream;
      this.settings = stream.getAudioTracks()[0].getSettings();
      this.source = context.createMediaStreamSource(stream);
      this.analyser = context.createAnalyser();
      this.analyser.fftSize = this.buffer.length;
      this.source.connect(this.analyser);
      stream.getAudioTracks()[0].addEventListener("ended", () => {
        if (generation !== this._generation) return;
        this.stop();
        this.onState("ended");
      });
      context.addEventListener("statechange", () => {
        if (generation === this._generation && this._running)
          this.onState(context.state);
      });
      this._initWorker(generation);
      this._running = true;
      this._timer = setInterval(() => this._analyze(), 40);
      this.onState("running");
    } catch (error) {
      stream?.getTracks().forEach((t) => t.stop());
      if (context && context.state !== "closed")
        await context.close().catch(() => {});
      if (generation === this._generation) this.stop();
      const messages = {
        NotAllowedError:
          "Microphone access is blocked. Allow it in your browser’s site settings, then try again.",
        NotFoundError:
          "No microphone found. Connect a microphone and try again.",
        NotReadableError:
          "The microphone is unavailable. Close other apps using it, then try again.",
        OverconstrainedError:
          "That microphone is no longer available. Choose the default input and try again.",
      };
      throw new Error(messages[error.name] || error.message);
    }
  }
  stop() {
    ++this._generation;
    this._running = false;
    this._starting = null;
    clearInterval(this._timer);
    this._timer = null;
    this.stream?.getTracks().forEach((t) => t.stop());
    this.stream = null;
    this.source?.disconnect();
    this.source = null;
    this.analyser?.disconnect();
    this.analyser = null;
    if (this.context) this.context.close().catch(() => {});
    this.context = null;
    this._fallback();
  }
  _analyze() {
    if (!this._running || this._inFlight || this.context.state !== "running")
      return;
    this.analyser.getFloatTimeDomainData(this.buffer);
    if (!this._worker) {
      this.onPitch(
        this.analysis.analyze(
          this.buffer,
          this.context.sampleRate,
          this.options,
        ),
      );
      return;
    }
    const samples = this.buffer.slice();
    this._inFlight = true;
    this._worker.postMessage(
      {
        type: "analyze",
        samples,
        sampleRate: this.context.sampleRate,
        options: this.options,
      },
      [samples.buffer],
    );
    this._watchdog = setTimeout(() => this._fallback(), 500);
  }
  _fallback() {
    clearTimeout(this._watchdog);
    this._worker?.terminate();
    this._worker = null;
    this._inFlight = false;
  }
  _initWorker(generation) {
    try {
      this._worker = new Worker(new URL("./pitch-worker.js", import.meta.url), {
        type: "module",
      });
      this._worker.onmessage = ({ data }) => {
        if (
          generation !== this._generation ||
          !this._running ||
          data.type !== "result"
        )
          return;
        clearTimeout(this._watchdog);
        this._inFlight = false;
        this.onPitch(data.result);
      };
      this._worker.onerror = () => {
        if (generation === this._generation) this._fallback();
      };
    } catch {
      this._fallback();
    }
  }
}
