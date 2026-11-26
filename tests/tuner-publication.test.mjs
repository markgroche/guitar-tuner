import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import vm from "node:vm";

const root = new URL("../", import.meta.url);
const scope = "https://example.test/guitar-tuner/";

async function serviceWorker(overrides = {}) {
  const handlers = {};
  const context = {
    URL,
    self: {
      registration: { scope },
      addEventListener(type, handler) { handlers[type] = handler; },
      clients: { async claim() {} },
    },
    ...overrides,
  };
  vm.runInNewContext(await readFile(new URL("sw.js", root), "utf8"), context);
  return handlers;
}

test("the main URL opens v2 even after a v1 visit; explicit v1 links survive reload", async () => {
  const html = await readFile(new URL("index.html", root), "utf8");
  const bootstrap = html.match(/<script>([\s\S]*?)<\/script>/)[1];
  for (const [search, expected] of [["", "acoustic"], ["?v=2", "acoustic"], ["?v=1", "classic"]]) {
    const document = { documentElement: { dataset: { skin: "acoustic" } } };
    vm.runInNewContext(bootstrap, {
      document,
      location: { search },
      URLSearchParams,
      localStorage: { getItem: () => "classic" },
    });
    assert.equal(document.documentElement.dataset.skin, expected);
  }
});

test("cache upgrades retire the old tuner cache while preserving other sites on the origin", async () => {
  const prefix = "guitar-tuner-pages-" + scope + "-";
  const current = prefix + "v2.0.0";
  const old = prefix + "v1.0.0";
  const unrelated = "guitar-tuner-pages-https://example.test/portfolio/-v1.0.0";
  const deleted = [];
  const handlers = await serviceWorker({
    caches: {
      async keys() { return [current, old, "guitar-tuner-v12", unrelated, "portfolio-guitar-tuner-v4"]; },
      async delete(key) { deleted.push(key); },
    },
  });
  let completed;
  handlers.activate({ waitUntil(promise) { completed = promise; } });
  await completed;
  assert.deepEqual(deleted.sort(), [old, "guitar-tuner-v12"].sort());
});

test("both version URLs recover the app shell offline without hijacking other sites", async () => {
  const shell = { cached: true };
  const handlers = await serviceWorker({
    caches: {
      async open() {
        return { async match(request) { return request === scope + "index.html" ? shell : undefined; } };
      },
    },
    async fetch() { throw new Error("offline"); },
  });
  for (const version of [1, 2]) {
    let response;
    handlers.fetch({
      request: { method: "GET", mode: "navigate", url: scope + "?v=" + version },
      respondWith(promise) { response = promise; },
    });
    assert.equal(await response, shell);
  }
  let intercepted = false;
  handlers.fetch({
    request: { method: "GET", mode: "navigate", url: "https://example.test/portfolio/" },
    respondWith() { intercepted = true; },
  });
  assert.equal(intercepted, false);
});
