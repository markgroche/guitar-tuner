const YIN_THRESHOLD = 0.15;
const MIN_FREQ = 60;
const MAX_FREQ = 1400;

self.onmessage = event => {
  const msg = event.data;
  if (!msg || msg.type !== 'analyze') return;
  const result = yin(msg.samples, msg.sampleRate);
  self.postMessage({ type: 'result', result });
};

function yin(buffer, sampleRate) {
  const halfLen = Math.floor(buffer.length / 2);
  const yinBuf  = new Float32Array(halfLen);

  for (let tau = 0; tau < halfLen; tau++) {
    yinBuf[tau] = 0;
    for (let i = 0; i < halfLen; i++) {
      const delta = buffer[i] - buffer[i + tau];
      yinBuf[tau] += delta * delta;
    }
  }

  yinBuf[0] = 1;
  let runningSum = 0;
  for (let tau = 1; tau < halfLen; tau++) {
    runningSum  += yinBuf[tau];
    yinBuf[tau] *= tau / runningSum;
  }

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
  const x0 = tau > 0 ? tau - 1 : tau;
  const x2 = tau + 1 < buf.length ? tau + 1 : tau;
  if (x0 === tau) return buf[tau] <= buf[x2] ? tau : x2;
  if (x2 === tau) return buf[tau] <= buf[x0] ? tau : x0;
  const s0 = buf[x0], s1 = buf[tau], s2 = buf[x2];
  return tau + (s2 - s0) / (2 * (2 * s1 - s2 - s0));
}
