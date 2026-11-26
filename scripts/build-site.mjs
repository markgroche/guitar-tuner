import { cp, mkdir, rm, access, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";

// Only runtime files reach Pages. Repository docs, tests and tooling stay out.
const root = new URL("../", import.meta.url);
const output = new URL("_site/", root);
await rm(output, { recursive: true, force: true });
await mkdir(output, { recursive: true });
const required = [
  "index.html", "styles.css", "tuner.js", "tuning-data.js", "pitch-core.js",
  "pitch-tracker.js", "pitch-detector.js", "pitch-worker.js", "tone-player.js",
  "sw.js", "manifest.json", "sample-manifest.json", "sample-calibration.json",
  "CREDITS.txt", "vendor", "samples", "icons",
];
const optional = ["acoustic-studio.css", "skin.js", "assets"];
for (const name of required) {
  await cp(new URL(name, root), new URL(name, output), { recursive: true });
}
for (const name of optional) {
  try { await access(new URL(name, root)); }
  catch { continue; }
  await cp(new URL(name, root), new URL(name, output), { recursive: true });
}
await writeFile(new URL(".nojekyll", output), "");
console.log(`Static site prepared at ${fileURLToPath(output)}`);
