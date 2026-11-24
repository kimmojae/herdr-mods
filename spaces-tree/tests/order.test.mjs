import { test } from "node:test";
import assert from "node:assert/strict";
import { agentOrder, spaceMoves } from "../mods/spaces-tree/lib/order.js";

const a = (address) => ({ kind: "agent", address });
const s = (address, o = {}) => ({ kind: "sub", address, ...o });

test("agentOrder lists a pinned+tree duplicate once, at its pinned position", () => {
  assert.deepEqual(agentOrder({ pinned: [a("x"), a("y")], tree: [a("z"), a("x")] }), ["x", "y", "z"]);
});

test("agentOrder keeps only kept subs and skips other rows", () => {
  const tree = [{ kind: "repo", key: "r" }, a("p"), s("k", { kept: true }), s("n"), s("m"), { kind: "tab", key: "t" }];
  assert.deepEqual(agentOrder({ pinned: [], tree }), ["p", "k"]);
  assert.deepEqual(agentOrder({ pinned: [], tree }, new Set(["m"])), ["p", "k", "m"]);
});

test("spaceMoves moves the last one to the front", () => {
  assert.deepEqual(spaceMoves(["a", "b", "c"], ["c", "a", "b"]), [{ id: "c", index: 1 }]);
});

test("spaceMoves is empty when already in order", () => {
  assert.deepEqual(spaceMoves(["a", "b"], ["a", "b"]), []);
});

test("spaceMoves ignores ids not in both lists", () => {
  assert.deepEqual(spaceMoves(["a", "b", "c"], ["c", "foreign", "a", "b"]), [{ id: "c", index: 1 }]);
  assert.deepEqual(spaceMoves(["a", "gone", "b"], ["b", "a"]), [{ id: "b", index: 1 }]);
});

test("spaceMoves simulates earlier moves", () => {
  assert.deepEqual(spaceMoves(["a", "b", "c"], ["c", "b", "a"]), [{ id: "c", index: 1 }, { id: "b", index: 2 }]);
});

import { dropOk, dropMoves } from "../mods/spaces-tree/lib/order.js";

const drag = (key, ids, o = {}) => ({ key, ids, group: key, machine: null, main: false, heading: true, ...o });
const co = (id, group, main = false, o = {}) => ({ key: `space:${id}`, ids: [id], group, machine: null, main, heading: false, ...o });

test("dropOk: checkouts within their heading, mains with mains; headings with headings; one machine", () => {
  assert.equal(dropOk(co("w1", "A"), co("w2", "A")), true);
  assert.equal(dropOk(co("w1", "A"), co("m", "A", true)), false);
  assert.equal(dropOk(co("w1", "A"), co("w3", "B")), false);
  assert.equal(dropOk(co("w1", "A"), drag("B", ["x"])), false);
  assert.equal(dropOk(drag("A", ["m"]), drag("B", ["x"])), true);
  assert.equal(dropOk(drag("A", ["m"]), co("x", "B")), false);
  assert.equal(dropOk(drag("A", ["m"]), drag("B", ["x"], { machine: "box" })), false);
  assert.equal(dropOk(drag("A", ["m"]), drag("A", ["m"])), false);
  assert.equal(dropOk(null, drag("A", ["m"])), false);
});

test("dropMoves: a heading's whole group goes after the target group (down) or before it (up)", () => {
  const order = ["a1", "a2", "b1", "c1", "c2"];
  const A = drag("A", ["a1", "a2"]), B = drag("B", ["b1"]), C = drag("C", ["c1", "c2"]);
  assert.deepEqual(dropMoves(order, A, C), [{ id: "b1", index: 1 }, { id: "c1", index: 2 }, { id: "c2", index: 3 }]);
  assert.deepEqual(dropMoves(order, C, A), [{ id: "c1", index: 1 }, { id: "c2", index: 2 }]);
  assert.deepEqual(dropMoves(order, B, A), [{ id: "b1", index: 1 }]);
});

test("dropMoves: one checkout moves to the target's place", () => {
  const order = ["m", "w1", "w2", "w3"];
  assert.deepEqual(dropMoves(order, co("w1", "A"), co("w3", "A")), [{ id: "w2", index: 2 }, { id: "w3", index: 3 }]);
  assert.deepEqual(dropMoves(order, co("w3", "A"), co("w1", "A")), [{ id: "w3", index: 2 }]);
  assert.deepEqual(dropMoves(order, co("gone", "A"), co("w1", "A")), []);
});
