import { test } from "node:test";
import assert from "node:assert/strict";
import { cacheName, staleFiles } from "../mods/code-explorer/lib/cache.js";

test("cacheName is per viewer and keeps the extension", () => {
  assert.equal(cacheName("v1", 2, "png"), ".cache/v1-2.png"); // hidden: writing it never reloads the mod
});

test("staleFiles drops files of viewers that are gone but never app icons", () => {
  const files = [{ name: "v1-1.png", size: 1, mtime: 1 }, { name: "v2-1.png", size: 1, mtime: 2 }, { name: "apps/x.png", size: 1, mtime: 0 }];
  assert.deepEqual(staleFiles(files, new Set(["v1"])), ["v2-1.png"]);
});

test("staleFiles trims the oldest live files until under the cap", () => {
  const files = [{ name: "v1-1.png", size: 6, mtime: 3 }, { name: "v1-2.png", size: 6, mtime: 1 }, { name: "v1-3.png", size: 6, mtime: 2 }];
  assert.deepEqual(staleFiles(files, new Set(["v1"]), 10), ["v1-2.png", "v1-3.png"]);
});
