import { test } from "node:test";
import assert from "node:assert/strict";
import { PALETTE, MARK, assignColors } from "../mods/spaces-tree/lib/colors.js";

test("palette and marks", () => {
  assert.deepEqual(PALETTE, ["ansi6", "ansi3", "ansi4", "ansi5", "ansi2", "ansi1"]);
  assert.equal(MARK.ansi6, "#22a99a");
  assert.deepEqual(Object.keys(MARK), PALETTE);
});

test("a new space gets the first colour; ~ gets none", () => {
  assert.deepEqual(assignColors({}, [{ id: "1", name: "x" }, { id: "2", name: "~" }]), { 1: "ansi6" });
});

test("least used wins, ties go to the earliest", () => {
  const r = assignColors({ 1: "ansi6", 2: "ansi6", 3: "ansi3" }, [1, 2, 3, 4].map((n) => ({ id: String(n), name: "x" })));
  assert.equal(r["4"], "ansi4");
});

test("unchanged input gives null", () => {
  assert.equal(assignColors({ 1: "ansi6" }, [{ id: "1", name: "x" }]), null);
});

test("a gone id is dropped without mutating the input", () => {
  const cur = { 1: "ansi6", 9: "ansi3" };
  assert.deepEqual(assignColors(cur, [{ id: "1", name: "x" }]), { 1: "ansi6" });
  assert.deepEqual(cur, { 1: "ansi6", 9: "ansi3" });
});
