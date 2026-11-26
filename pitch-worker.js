import { PitchAnalysis } from "./pitch-core.js";
let analysis;
self.onmessage = ({ data }) => {
  if (data.type !== "analyze") return;
  analysis ??= new PitchAnalysis(data.samples.length);
  self.postMessage({
    type: "result",
    result: analysis.analyze(data.samples, data.sampleRate, data.options),
  });
};
