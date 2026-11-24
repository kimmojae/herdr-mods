import { test } from "node:test";
import assert from "node:assert/strict";
import { tail } from "../mods/spaces-tree/lib/tail.js";

const g = (o = {}) => ({ name: "acme", branch: "main", repo: "r", linked: false, state: { ahead: 2, behind: 1, conflicted: 0, deleted: 0, renamed: 0, modified: 3, staged: 0, untracked: 0, stashed: false }, ...o });

test("only the PR tag: no branch, no ↑↓ or ~N chips (git's state is symbols after the name)", () => {
  assert.deepEqual(tail({ git: g() }), []);
  assert.deepEqual(tail({ git: g(), pr: null }), []);
});

test("pr tags", () => {
  const t = (pr) => tail({ git: g(), pr });
  assert.deepEqual(t({ number: 128, kind: "ok" }), [{ text: "#128 ✓", tone: "done", kind: "pr" }]);
  assert.deepEqual(t({ number: 131, kind: "failing" }).at(-1), { text: "#131 checks", tone: "blocked", kind: "pr" });
  assert.deepEqual(t({ number: 207, kind: "review" }).at(-1), { text: "#207 review", tone: "accent", kind: "pr" });
  assert.deepEqual(t({ number: 14, kind: "merged" }).at(-1), { text: "#14 merged", tone: "ansi5", kind: "pr" });
});

test("no git, no tail", () => {
  assert.deepEqual(tail({ git: null, pr: { number: 1, kind: "ok" } }), []);
});
