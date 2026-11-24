import { test } from "node:test";
import assert from "node:assert/strict";
import { presence, presenceState } from "../mods/spaces-tree/lib/presence.js";

const key = (x) => x.id;
const rows = (...ids) => ids.map((id) => ({ id, v: id }));
const phases = (r) => r.list.map((x) => `${x.key}:${x.phase}`);

test("the first call shows what is there without entering", () => {
  const s = presenceState();
  const r = presence(s, rows("a", "b"), key, 0, 180);
  assert.deepEqual(phases(r), ["a:shown", "b:shown"]);
  assert.equal(r.wake, null);
  assert.equal(r.moving, false);
});

test("a new row enters once at zero, then shows", () => {
  const s = presenceState();
  presence(s, rows("a"), key, 0, 180);
  const r1 = presence(s, rows("a", "b"), key, 10, 180);
  assert.deepEqual(phases(r1), ["a:shown", "b:enter"]);
  assert.equal(r1.wake, 16);
  assert.equal(r1.moving, true);
  const r2 = presence(s, rows("a", "b"), key, 26, 180);
  assert.deepEqual(phases(r2), ["a:shown", "b:shown"]);
  assert.equal(r2.wake, null);
  assert.equal(r2.moving, true); // it was just set to full: the transition runs now
  const r3 = presence(s, rows("a", "b"), key, 400, 180);
  assert.equal(r3.moving, false);
});

test("a leaving row keeps its last content and place, then is dropped", () => {
  const s = presenceState();
  presence(s, [{ id: "a", v: 1 }, { id: "b", v: 2 }, { id: "c", v: 3 }], key, 0, 180);
  const r1 = presence(s, [{ id: "a", v: 1 }, { id: "c", v: 3 }], key, 100, 180);
  assert.deepEqual(phases(r1), ["a:shown", "b:leave", "c:shown"]);
  assert.equal(r1.list[1].item.v, 2);
  assert.equal(r1.wake, 180);
  const r2 = presence(s, rows("a", "c"), key, 200, 180);
  assert.deepEqual(phases(r2), ["a:shown", "b:leave", "c:shown"]);
  assert.equal(r2.wake, 80);
  const r3 = presence(s, rows("a", "c"), key, 280, 180);
  assert.deepEqual(phases(r3), ["a:shown", "c:shown"]);
  assert.equal(r3.wake, null);
});

test("a row back before its leave ran out shows again with its new content", () => {
  const s = presenceState();
  presence(s, rows("a"), key, 0, 180);
  presence(s, [], key, 10, 180);
  const r = presence(s, [{ id: "a", v: "new" }], key, 50, 180);
  assert.deepEqual(phases(r), ["a:shown"]);
  assert.equal(r.list[0].item.v, "new");
  assert.equal(r.moving, true);
});

test("the last row leaving leaves a list of leaving rows, then nothing", () => {
  const s = presenceState();
  presence(s, rows("a", "b"), key, 0, 180);
  const r1 = presence(s, [], key, 5, 180);
  assert.deepEqual(phases(r1), ["a:leave", "b:leave"]);
  const r2 = presence(s, [], key, 185, 180);
  assert.deepEqual(r2.list, []);
  assert.equal(r2.wake, null);
});

test("a reorder of current rows just follows the new order", () => {
  const s = presenceState();
  presence(s, rows("a", "b", "c"), key, 0, 180);
  const r = presence(s, rows("c", "a", "b"), key, 10, 180);
  assert.deepEqual(phases(r), ["c:shown", "a:shown", "b:shown"]);
  assert.equal(r.moving, false);
});

test("a leaving row past the end goes last", () => {
  const s = presenceState();
  presence(s, rows("a", "b", "c"), key, 0, 180);
  const r = presence(s, rows("a"), key, 10, 180);
  assert.deepEqual(phases(r), ["a:shown", "b:leave", "c:leave"]);
});
