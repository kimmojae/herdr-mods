import { test } from "node:test";
import assert from "node:assert/strict";
import { newViewerId, findOpen, previewEntry, claimTab, prune } from "../mods/code-explorer/lib/registry.js";

const file = (path) => ({ path, rel: path.slice(3), root: "/r", on: null });
const entries = {
  v1: { space: "s1", file: file("/r/a.ts"), preview: true, tab: "t1", others: [], at: 0 },
  v2: { space: "s1", file: file("/r/b.ts"), preview: false, tab: "t2", others: [], at: 0 },
  v3: { space: "s2", file: file("/r/a.ts"), preview: true, tab: "t3", others: [], at: 0 },
  v4: { space: "s1", file: file("/r/c.ts"), preview: false, tab: null, others: ["t1", "t2"], at: 1000 },
};

test("newViewerId is unique per call and starts with v", () => {
  const a = newViewerId(1, 0.123456789), b = newViewerId(1, 0.987654321);
  assert.match(a, /^v/);
  assert.notEqual(a, b);
});

test("findOpen matches space and path only", () => {
  assert.equal(findOpen(entries, "s1", "/r/a.ts")[0], "v1");
  assert.equal(findOpen(entries, "s2", "/r/a.ts")[0], "v3");
  assert.equal(findOpen(entries, "s1", "/r/zz.ts"), null);
});

test("previewEntry is the space's shared preview viewer", () => {
  assert.equal(previewEntry(entries, "s1")[0], "v1");
  assert.equal(previewEntry({ v2: entries.v2 }, "s1"), null);
});

test("claimTab takes the focused viewer tab no one holds", () => {
  assert.equal(claimTab(entries, "v4", "t9", new Set(["t9"])), "t9");
});

test("claimTab refuses a tab another viewer holds, a tab listed in others, and a non-viewer tab", () => {
  assert.equal(claimTab(entries, "v4", "t2", new Set(["t2"])), null);
  assert.equal(claimTab({ v4: { ...entries.v4 } }, "v4", "t1", new Set(["t1"])), null);
  assert.equal(claimTab(entries, "v4", "t9", new Set()), null);
});

test("claimTab returns nothing for a viewer that already has its tab", () => {
  assert.equal(claimTab(entries, "v1", "t9", new Set(["t9"])), null);
});

test("prune keeps live tabs and young unclaimed viewers, drops the rest", () => {
  const kept = prune(entries, new Set(["t1", "t3"]), 5000, 15000);
  assert.deepEqual(Object.keys(kept).sort(), ["v1", "v3", "v4"]);
  assert.deepEqual(Object.keys(prune(entries, new Set(["t1"]), 100000, 15000)).sort(), ["v1"]);
});
