import { test } from "node:test";
import assert from "node:assert/strict";
import { findMatches, markFound, nextIndex, MAX_MATCHES } from "../mods/code-explorer/lib/find.js";

test("findMatches finds every match on every line, ignoring case by default", () => {
  const { matches, error } = findMatches(["Foo foo", "bar", "FOO"], "foo");
  assert.equal(error, null);
  assert.deepEqual(matches, [{ item: 0, start: 0, end: 3 }, { item: 0, start: 4, end: 7 }, { item: 2, start: 0, end: 3 }]);
});

test("Aa matches case", () => {
  assert.deepEqual(findMatches(["Foo foo"], "foo", { caseSensitive: true }).matches, [{ item: 0, start: 4, end: 7 }]);
});

test("ab matches whole words only", () => {
  assert.deepEqual(findMatches(["router routers my_router router"], "router", { wholeWord: true }).matches.map((m) => m.start), [0, 25]);
});

test("whole words treat Korean letters as word characters", () => {
  assert.deepEqual(findMatches(["마이그레이션 마이"], "마이", { wholeWord: true }).matches, [{ item: 0, start: 7, end: 9 }]);
});

test("the query is literal unless .* is on", () => {
  assert.deepEqual(findMatches(["a.c abc"], "a.c").matches, [{ item: 0, start: 0, end: 3 }]);
  assert.deepEqual(findMatches(["a.c abc"], "a.c", { regex: true }).matches.map((m) => m.start), [0, 4]);
});

test("a broken expression is an error, not a throw", () => {
  const r = findMatches(["x"], "(", { regex: true });
  assert.deepEqual(r.matches, []);
  assert.ok(r.error);
});

test("an empty query or an expression matching nothing wide finds nothing", () => {
  assert.deepEqual(findMatches(["abc"], "").matches, []);
  assert.deepEqual(findMatches(["abc"], "x*", { regex: true }).matches, []);
});

test("null items are skipped but keep their index", () => {
  assert.deepEqual(findMatches([null, "a"], "a").matches, [{ item: 1, start: 0, end: 1 }]);
});

test("findMatches stops at MAX_MATCHES", () => {
  const r = findMatches(["a".repeat(MAX_MATCHES + 5)], "a");
  assert.equal(r.matches.length, MAX_MATCHES);
  assert.equal(r.capped, true);
});

test("markFound splits runs at matches, tagging the current one", () => {
  const runs = [["keyword", "import"], ["plain", " os"]];
  assert.deepEqual(markFound(runs, [[4, 8, false]]), [["keyword", "impo"], ["keyword", "rt", undefined, "match"], ["plain", " o", undefined, "match"], ["plain", "s"]]);
  assert.deepEqual(markFound(runs, [[0, 2, true]]), [["keyword", "im", undefined, "current"], ["keyword", "port"], ["plain", " os"]]);
});

test("markFound keeps a run's own mark", () => {
  assert.deepEqual(markFound([["plain", "abcd", true]], [[1, 2, false]]), [["plain", "a", true], ["plain", "b", true, "match"], ["plain", "cd", true]]);
});

test("markFound without ranges leaves runs as they are", () => {
  const runs = [["plain", "x"]];
  assert.equal(markFound(runs, []), runs);
});

test("nextIndex steps and wraps both ways", () => {
  assert.equal(nextIndex(0, 3, 1), 1);
  assert.equal(nextIndex(2, 3, 1), 0);
  assert.equal(nextIndex(0, 3, -1), 2);
  assert.equal(nextIndex(-1, 3, 1), 0);
  assert.equal(nextIndex(0, 0, 1), -1);
});
