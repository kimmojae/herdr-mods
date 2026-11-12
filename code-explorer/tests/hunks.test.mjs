import { test } from "node:test";
import assert from "node:assert/strict";
import { parseHunks, buildRows, hunkKey, allAdded, buildSideRows, wordRange, markRuns, lineCounts } from "../mods/code-explorer/lib/hunks.js";

test("parseHunks reads changed, added and removed hunks", () => {
  const diff = "diff --git a/x b/x\n@@ -19 +19,2 @@\n-a\n+b\n+c\n@@ -30,0 +32 @@\n+new\n@@ -40,2 +41,0 @@\n-gone1\n-gone2\n";
  const [changed, added, removed] = parseHunks(diff);
  assert.deepEqual(changed, { kind: "changed", line: 18, count: 2, oldStart: 19, old: ["a"] });
  assert.equal(added.kind, "added");
  assert.equal(added.line, 31);
  assert.deepEqual(removed, { kind: "removed", line: 41, count: 0, oldStart: 40, old: ["gone1", "gone2"] });
});

test("buildRows marks lines and shows old lines only for open hunks", () => {
  const lines = ["l1", "l2", "l3"];
  const hunk = { kind: "changed", line: 1, count: 1, oldStart: 2, old: ["was"] };
  const closed = buildRows(lines, [hunk], new Set());
  assert.deepEqual(closed.map((r) => r.type), ["line", "line", "line"]);
  assert.equal(closed[1].hunk, hunk);
  const open = buildRows(lines, [hunk], new Set([hunkKey(hunk)]));
  assert.deepEqual(open.map((r) => r.type), ["line", "old", "line", "line"]);
  assert.equal(open[1].text, "was");
});

test("a removed hunk is a thin row of its own until opened", () => {
  const hunk = { kind: "removed", line: 1, count: 0, oldStart: 2, old: ["x"] };
  assert.deepEqual(buildRows(["a", "b"], [hunk], new Set()).map((r) => r.type), ["line", "removed", "line"]);
});

test("allAdded covers the whole file", () => {
  assert.deepEqual(allAdded(), [{ kind: "added", line: 0, count: Infinity, oldStart: 0, old: [] }]);
});

// old: a b c d e f g → new: a B c x d f g
const SIDE_DIFF = "@@ -2 +2 @@ a\n-b\n+B\n@@ -3,0 +4 @@ c\n+x\n@@ -5 +5,0 @@ d\n-e\n";
const side = (r) => [r.kind, r.left ? `${r.left.number}:${r.left.text}` : "-", r.right ? `${r.right.number}:${r.right.text}` : "-"];

test("buildSideRows lines HEAD up against the file, with gaps where one side has no line", () => {
  const rows = buildSideRows(["a", "B", "c", "x", "d", "f", "g"], parseHunks(SIDE_DIFF));
  assert.deepEqual(rows.map(side), [
    ["same", "1:a", "1:a"],
    ["changed", "2:b", "2:B"],
    ["same", "3:c", "3:c"],
    ["added", "-", "4:x"],
    ["same", "4:d", "5:d"],
    ["removed", "5:e", "-"],
    ["same", "6:f", "6:f"],
    ["same", "7:g", "7:g"],
  ]);
  assert.equal(new Set(rows.map((r) => r.key)).size, rows.length);
});

test("buildSideRows pairs a changed hunk line by line and leaves the rest one-sided", () => {
  const hunks = parseHunks("@@ -2,2 +2,3 @@\n-b\n-c\n+B\n+C\n+D\n");
  assert.deepEqual(buildSideRows(["a", "B", "C", "D", "e"], hunks).map(side), [
    ["same", "1:a", "1:a"],
    ["changed", "2:b", "2:B"],
    ["changed", "3:c", "3:C"],
    ["added", "-", "4:D"],
    ["same", "4:e", "5:e"],
  ]);
});

test("buildSideRows shows lines removed at the very end", () => {
  const rows = buildSideRows(["a"], parseHunks("@@ -2,2 +1,0 @@\n-b\n-c\n"));
  assert.deepEqual(rows.map(side), [["same", "1:a", "1:a"], ["removed", "2:b", "-"], ["removed", "3:c", "-"]]);
});

test("wordRange finds the part of a changed line that differs", () => {
  assert.deepEqual(wordRange("const { a, b } = x", "const { a, b, done } = x"), { left: [12, 12], right: [12, 18] });
  assert.deepEqual(wordRange("max(...v)", "max(1, ...v)"), { left: [4, 4], right: [4, 7] });
  assert.equal(wordRange("abc", "xyz"), null);
  assert.equal(wordRange("same", "same"), null);
});

test("markRuns splits highlighted runs at a range and flags the inside", () => {
  const runs = [["keyword", "const"], ["plain", " max = "], ["function", "fn"]];
  assert.deepEqual(markRuns(runs, [3, 9]), [
    ["keyword", "con"], ["keyword", "st", true], ["plain", " max", true], ["plain", " = "], ["function", "fn"],
  ]);
  assert.deepEqual(markRuns(runs, null), runs);
  assert.deepEqual(markRuns(runs, [5, 5]), runs);
});

test("markRuns drops empty runs, which would draw as a stray space", () => {
  assert.deepEqual(markRuns([["plain", ""], ["mdPunct", "```"]], null), [["mdPunct", "```"]]);
  assert.deepEqual(markRuns([["plain", ""]], null), []);
});

test("lineCounts adds up lines added and removed, like git --stat", () => {
  assert.deepEqual(lineCounts(parseHunks(SIDE_DIFF), 7), { added: 2, removed: 2 });
  assert.deepEqual(lineCounts(allAdded(), 40), { added: 40, removed: 0 });
  assert.deepEqual(lineCounts([], 10), { added: 0, removed: 0 });
});
