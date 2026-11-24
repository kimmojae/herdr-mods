import { test } from "node:test";
import assert from "node:assert/strict";
import { readFolds, writeFolds, pruneFolds, migrateFolds } from "../mods/spaces-tree/lib/folds.js";

const ready = (name) => ({ name, layout: "ready" });
const loading = (name) => ({ name, layout: "loading" });

test("readFolds migrates the old list of ids, reads the new one, survives junk", () => {
  assert.deepEqual([...readFolds('["a","b"]')], [["a", undefined], ["b", undefined]]);
  assert.deepEqual([...readFolds('[["a",null],["b","box"],["c"]]')], [["a", null], ["b", "box"], ["c", undefined]]);
  assert.deepEqual([...readFolds("{")], []);
  assert.deepEqual([...readFolds('{"a":1}')], []);
  assert.deepEqual([...readFolds(null)], []);
  assert.deepEqual([...readFolds('[1,[2],["d",5]]')], [["d", undefined]]);
});

test("writeFolds round-trips, unknown machines without a second field", () => {
  const f = new Map([["a", null], ["b", "box"], ["c", undefined]]);
  assert.equal(writeFolds(f), '[["a",null],["b","box"],["c"]]');
  assert.deepEqual([...readFolds(writeFolds(f))], [...f]);
});

test("a machine still loading, away or unlisted keeps its folds", () => {
  const f = new Map([["r1", "box"], ["r2", "gone"], ["r3", "away"]]);
  const ms = [ready(null), loading("box"), { name: "away", layout: "unavailable" }];
  assert.equal(pruneFolds(f, [], ms), false);
  assert.deepEqual([...f.keys()], ["r1", "r2", "r3"]);
});

test("stale ids on a ready machine go; listed ones stay", () => {
  const f = new Map([["l1", null], ["l2", null], ["r1", "box"]]);
  const changed = pruneFolds(f, [{ id: "l1" }], [ready(null), loading("box")]);
  assert.equal(changed, true);
  assert.deepEqual([...f.keys()], ["l1", "r1"]);
});

test("unknown-machine folds: filled in when listed, dropped only when all is ready and nothing waits", () => {
  const f = new Map([["a", undefined], ["b", undefined]]);
  assert.equal(pruneFolds(f, [{ id: "a", machine: "box" }], [ready(null), loading("box")]), true);
  assert.deepEqual([...f], [["a", "box"], ["b", undefined]]);
  assert.equal(pruneFolds(f, [{ id: "a", machine: "box" }], [ready(null), ready("box")], true), false);
  assert.equal(f.has("b"), true);
  assert.equal(pruneFolds(f, [{ id: "a", machine: "box" }], [ready(null), ready("box")]), true);
  assert.deepEqual([...f], [["a", "box"]]);
});

const R = (repo, m = null) => `repo:${JSON.stringify([m, `/r/${repo}/.git`])}`;
const G = (repo, m = null) => ({ name: repo, branch: "main", repo: JSON.stringify([m, `/r/${repo}/.git`]), linked: false });

test("migrateFolds: an old space-id fold becomes its heading's once git is known; a worktree's goes", () => {
  const f = new Map([["s1", null], ["s2", null], ["s3", "box"], ["gone", null], ["w", null]]);
  const spaces = [{ id: "s1" }, { id: "s2" }, { id: "s3", machine: "box" }, { id: "w" }];
  const git = new Map([["s1", G("acme")], ["s2", null], ["w", { ...G("zed"), linked: true }]]);
  assert.equal(migrateFolds(f, spaces, git), true);
  assert.deepEqual([...f], [["s3", "box"], ["gone", null], [R("acme"), null], ["space:s2", null]]);
  assert.equal(migrateFolds(f, spaces, git), false);
});

test("heading folds: kept while listed; dropped only when the machine is ready and all its git known", () => {
  const f = new Map([[R("acme"), null], [R("old"), null], ["space:x", null], [R("far", "box"), "box"]]);
  const spaces = [{ id: "a" }, { id: "x" }, { id: "y" }, { id: "r", machine: "box" }];
  // y's git isn't known yet: this computer's headings can't be judged.
  let git = new Map([["a", G("acme")], ["x", null], ["r", G("far", "box")]]);
  assert.equal(pruneFolds(f, spaces, [ready(null), ready("box")], false, git), false);
  assert.equal(f.size, 4);
  git = new Map([...git, ["y", null]]);
  assert.equal(pruneFolds(f, spaces, [ready(null), loading("box")], false, git), true);
  assert.deepEqual([...f.keys()], [R("acme"), "space:x", R("far", "box")]);
  // x is now in git: its folder heading is gone.
  git.set("x", G("zed"));
  assert.equal(pruneFolds(f, spaces, [ready(null), loading("box")], false, git), true);
  assert.deepEqual([...f.keys()], [R("acme"), R("far", "box")]);
});
