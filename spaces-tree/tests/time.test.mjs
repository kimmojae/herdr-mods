import { test } from "node:test";
import assert from "node:assert/strict";
import { clean, age, track } from "../mods/spaces-tree/lib/time.js";

const DAY = 86400000;

test("age: floors into <1m, m, h, d", () => {
  assert.equal(age(30e3), "<1m");
  assert.equal(age(59e3), "<1m");
  assert.equal(age(60e3), "1m");
  assert.equal(age(4 * 60e3), "4m");
  assert.equal(age(59 * 60e3), "59m");
  assert.equal(age(3 * 3600e3), "3h");
  assert.equal(age(23 * 3600e3), "23h");
  assert.equal(age(2 * 86400e3), "2d");
});

test("clean: drops a leading glyph or spinner, keeps brackets and quotes", () => {
  assert.equal(clean("✦  Working"), "Working");
  assert.equal(clean("⠋ - Thinking"), "Thinking");
  assert.equal(clean("[ ! ] Approve?"), "Approve?");
  assert.equal(clean("[web] login"), "[web] login");
  assert.equal(clean(undefined), "");
});

test("track: new agent stamps at and is dirty", () => {
  const r = track({}, [{ address: "a", status: "working" }], [], 100);
  assert.deepEqual(r.changed.a, { s: "working", at: 100 });
  assert.equal(r.dirty, true);
});

test("track: done -> idle does not reset at; same object, not dirty", () => {
  const changed = { a: { s: "idle", at: 5 } };
  const r = track(changed, [{ address: "a", status: "done" }], [], 100);
  assert.equal(r.dirty, false);
  assert.equal(r.changed, changed);
});

test("track: a new status resets at, input untouched", () => {
  const changed = { a: { s: "working", at: 5 } };
  const r = track(changed, [{ address: "a", status: "blocked" }], [], 100);
  assert.deepEqual(r.changed.a, { s: "blocked", at: 100 });
  assert.equal(r.dirty, true);
  assert.deepEqual(changed.a, { s: "working", at: 5 });
});

test("track: subs are tracked too", () => {
  const r = track({}, [], [{ address: "k", status: "blocked" }], 100);
  assert.equal(r.changed.k.s, "blocked");
});

test("track: missing entries older than 30 days are pruned, newer kept", () => {
  const now = 100 * DAY;
  const changed = { old: { s: "idle", at: now - 31 * DAY }, recent: { s: "idle", at: now - 2 * DAY } };
  const r = track(changed, [{ address: "a", status: "working" }], [], now);
  assert.equal(r.dirty, true);
  assert.equal("old" in r.changed, false);
  assert.equal("recent" in r.changed, true);
  assert.equal("old" in changed, true);
});

test("track: prune only runs when something changed", () => {
  const now = 100 * DAY;
  const changed = { old: { s: "idle", at: now - 31 * DAY }, a: { s: "working", at: now } };
  const r = track(changed, [{ address: "a", status: "working" }], [], now);
  assert.equal(r.dirty, false);
  assert.equal(r.changed, changed);
});
