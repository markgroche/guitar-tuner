import test from "node:test";
import assert from "node:assert/strict";
import { readFile, access } from "node:fs/promises";
import vm from "node:vm";
const root = new URL("../", import.meta.url);

test("offline install caches every module, recording and notice with paths that exist", async () => {
  const handlers = {},
    urls = [];
  let installed;
  const manifest = JSON.parse(
    await readFile(new URL("sample-manifest.json", root), "utf8"),
  );
  const context = {
    URL,
    self: {
      registration: { scope: "https://example.test/tuner/" },
      addEventListener(type, handler) {
        handlers[type] = handler;
      },
      async skipWaiting() {},
    },
    caches: {
      async open() {
        return {
          async addAll(list) {
            urls.push(...list);
          },
        };
      },
    },
    async fetch() {
      return {
        ok: true,
        async json() {
          return manifest;
        },
      };
    },
  };
  vm.runInNewContext(await readFile(new URL("sw.js", root), "utf8"), context);
  handlers.install({
    waitUntil(p) {
      installed = p;
    },
  });
  await installed;
  assert.ok(urls.length >= 60);
  for (const url of urls) {
    const relative = new URL(url).pathname.replace("/tuner/", "");
    await access(new URL(relative || "index.html", root));
  }
  assert.ok(urls.some((url) => url.endsWith("vendor/pitchy.js")));
  assert.ok(urls.some((url) => url.endsWith("CREDITS.txt")));
});
