import { test } from "node:test";
import assert from "node:assert/strict";
import { needsYou } from "../mods/spaces-tree/lib/band.js";

const agent = (address, status, o = {}) => ({ address, pane: `p-${address}`, space: "s1", space_name: "web", status, title: `✦ t-${address}`, ...o });
const sub = (address, parent, o = {}) => ({ address, parent, status: "blocked", title: `s-${address}`, program: {}, kept: false, ...o });
const spaces = new Map([["s1", { name: "web", branch: "main" }], ["s2", { name: "api", branch: null }]]);
const now = 100 * 60e3;
const changed = { a: { s: "blocked", at: now - 12 * 60e3 }, b: { s: "idle", at: now - 4 * 60e3 }, k: { s: "blocked", at: now - 1 * 60e3 } };

test("drops working and idle, orders longest wait first", () => {
  const list = needsYou([agent("b", "done"), agent("a", "blocked"), agent("w", "working"), agent("i", "idle")], [], changed, now, spaces);
  assert.deepEqual(list.map((r) => r.address), ["a", "b"]);
  assert.equal(list[0].waited, 12 * 60e3);
  assert.equal(list[0].title, "t-a");
  assert.equal(list[0].pane, "p-a");
  assert.equal(list[0].status, "blocked");
  assert.equal(list[0].where, "web · main");
});

test("where: name only without branch, space_name when space unknown", () => {
  const list = needsYou([agent("a", "blocked", { space: "s2", space_name: "api" }), agent("b", "done", { space: "zz", space_name: "gone" })], [], changed, now, spaces);
  assert.equal(list.find((r) => r.address === "a").where, "api");
  assert.equal(list.find((r) => r.address === "b").where, "gone");
});

test("untracked agent waited is 0", () => {
  const list = needsYou([agent("n", "blocked")], [], {}, now, spaces);
  assert.equal(list[0].waited, 0);
});

test("includes a blocked non-kept sub, excludes kept and non-blocked subs", () => {
  const list = needsYou(
    [agent("a", "blocked"), agent("k", "working")],
    [sub("k1", "a"), sub("k", "a", { kept: true }), sub("k2", "a", { status: "working" }), sub("k3", "a", { status: "idle" })],
    { ...changed, k1: { s: "blocked", at: now - 2 * 60e3 } }, now, spaces);
  assert.deepEqual(list.map((r) => r.address), ["a", "k1"]);
  const s = list[1];
  assert.equal(s.pane, undefined);
  assert.equal(s.where, "web · main");
  assert.equal(s.title, "s-k1");
  assert.equal(s.status, "blocked");
});

test("sub whose parent is not listed has empty where", () => {
  const list = needsYou([], [sub("k1", "gone")], {}, now, spaces);
  assert.equal(list[0].where, "");
});

import { spacePlaces } from "../mods/spaces-tree/lib/band.js";

test("spacePlaces: repo name and branch from the space's git; a space not in git by its name", () => {
  const sp = [{ id: "w", name: "qa-demo" }, { id: "n", name: "notes" }, { id: "u", name: "new" }];
  const git = new Map([["w", { name: "qa-web", branch: "feat/demo" }], ["n", null]]);
  const places = spacePlaces(sp, git);
  assert.deepEqual(places.get("w"), { name: "qa-web", branch: "feat/demo" });
  assert.deepEqual(places.get("n"), { name: "notes", branch: null });
  assert.deepEqual(places.get("u"), { name: "new", branch: null });
  const rows = needsYou([agent("a", "blocked", { space: "w" })], [], {}, now, places);
  assert.equal(rows[0].where, "qa-web · feat/demo");
});

import { placeLabel } from "../mods/spaces-tree/lib/band.js";

test("placeLabel: repo · branch, else the name; nothing for no place", () => {
  assert.equal(placeLabel({ name: "acme-web", branch: "main" }), "acme-web · main");
  assert.equal(placeLabel({ name: "scratch", branch: null }), "scratch");
  assert.equal(placeLabel(undefined), "");
});

test("a done agent in the focused pane stays out; a focused blocked one stays in", () => {
  const list = needsYou([agent("d", "done", { focused: true }), agent("a", "blocked", { focused: true }), agent("b", "done")], [], changed, now, spaces);
  assert.deepEqual(list.map((r) => r.address), ["a", "b"]);
});
