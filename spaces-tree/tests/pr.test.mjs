import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { PR_ARGS, parsePr, prAnswer, prDue, prShown } from "../mods/spaces-tree/lib/pr.js";

const fixture = (n) => readFileSync(new URL(`./fixtures/pr-${n}.json`, import.meta.url), "utf8");
const ok = (stdout) => ({ code: 0, stdout, stderr: "" });
const rollup = (...r) => ok(JSON.stringify({ number: 1, url: "u", state: "OPEN", isDraft: false, reviewDecision: "", statusCheckRollup: r }));

test("PR_ARGS", () => {
  assert.deepEqual(PR_ARGS, ["pr", "view", "--json", "number,state,isDraft,url,statusCheckRollup,reviewDecision,headRefOid"]);
});

test("real fixtures: one per kind", () => {
  assert.deepEqual(parsePr(ok(fixture("failing"))), { number: 14927, url: "https://github.com/cli/cli/pull/14927", kind: "failing" });
  assert.equal(parsePr(ok(fixture("review"))).kind, "review");
  assert.equal(parsePr(ok(fixture("ok"))).kind, "ok");
  assert.deepEqual(parsePr(ok(fixture("merged"))), { number: 9000, url: "https://github.com/cli/cli/pull/9000", kind: "merged" });
  assert.equal(parsePr(ok(fixture("closed"))), null);
});

test("unparseable or failed gh gives null", () => {
  assert.equal(parsePr({ code: 1, stdout: fixture("ok"), stderr: "no pull requests found" }), null);
  assert.equal(parsePr(ok("")), null);
  assert.equal(parsePr(ok("  \n")), null);
  assert.equal(parsePr(ok("not json")), null);
  assert.equal(parsePr(ok("null")), null);
  assert.equal(parsePr(ok("[]")), null);
  assert.equal(parsePr(null), null);
  assert.equal(parsePr(undefined), null);
});

test("failing conclusions and states", () => {
  for (const conclusion of ["FAILURE", "ERROR", "CANCELLED", "TIMED_OUT", "ACTION_REQUIRED", "STARTUP_FAILURE"]) {
    assert.equal(parsePr(rollup({ __typename: "CheckRun", status: "COMPLETED", conclusion })).kind, "failing", conclusion);
  }
  for (const state of ["FAILURE", "ERROR"]) {
    assert.equal(parsePr(rollup({ __typename: "StatusContext", state })).kind, "failing", state);
  }
  assert.equal(parsePr(rollup({ __typename: "StatusContext", state: "SUCCESS" }, { __typename: "CheckRun", status: "COMPLETED", conclusion: "SKIPPED" })).kind, "ok");
  assert.equal(parsePr(rollup({ __typename: "CheckRun", status: "IN_PROGRESS", conclusion: "" })).kind, "ok");
});

test("merged beats failing; failing beats review", () => {
  const bad = { __typename: "CheckRun", status: "COMPLETED", conclusion: "FAILURE" };
  const mk = (o) => ok(JSON.stringify({ number: 2, url: "u", state: "OPEN", isDraft: false, reviewDecision: "", statusCheckRollup: [bad], ...o }));
  assert.equal(parsePr(mk({ state: "MERGED" })).kind, "merged");
  assert.equal(parsePr(mk({ reviewDecision: "REVIEW_REQUIRED", isDraft: true })).kind, "failing");
});

test("review: decision or draft", () => {
  const mk = (o) => ok(JSON.stringify({ number: 3, url: "u", state: "OPEN", isDraft: false, reviewDecision: "", statusCheckRollup: [], ...o }));
  assert.equal(parsePr(mk({ reviewDecision: "REVIEW_REQUIRED" })).kind, "review");
  assert.equal(parsePr(mk({ reviewDecision: "CHANGES_REQUESTED" })).kind, "review");
  assert.equal(parsePr(mk({ isDraft: true })).kind, "review");
  assert.equal(parsePr(mk({ reviewDecision: "APPROVED" })).kind, "ok");
  assert.equal(parsePr(mk({ reviewDecision: null })).kind, "ok");
  assert.equal(parsePr(mk({ statusCheckRollup: undefined })).kind, "ok");
});

test("prDue", () => {
  const entry = { branch: "main", at: 1_000_000 };
  assert.equal(prDue(undefined, "main", 1_000_000), true);
  assert.equal(prDue(entry, "main", 1_000_000 + 59_000), false);
  assert.equal(prDue(entry, "main", 1_000_000 + 60_000), true);
  assert.equal(prDue(entry, "dev", 1_000_000 + 1), true);
});

test("prAnswer: a good answer, closed and no PR replace what was shown", () => {
  const good = JSON.stringify({ number: 3, url: "u", state: "OPEN", statusCheckRollup: [] });
  assert.deepEqual(prAnswer(ok(good)), { pr: { number: 3, url: "u", kind: "ok" } });
  assert.deepEqual(prAnswer(ok(JSON.stringify({ number: 3, url: "u", state: "CLOSED" }))), { pr: null });
  assert.deepEqual(prAnswer({ code: 1, stdout: "", stderr: 'no pull requests found for branch "x"' }), { pr: null });
});

test("prAnswer: auth, network, missing gh and unreadable output are no answer", () => {
  assert.deepEqual(prAnswer({ code: 4, stdout: "", stderr: "gh auth login" }), { failed: true });
  assert.deepEqual(prAnswer({ code: 1, stdout: "", stderr: "error connecting to api.github.com" }), { failed: true });
  assert.deepEqual(prAnswer({ code: 127, stdout: "", stderr: "" }), { failed: true });
  assert.deepEqual(prAnswer(ok("")), { failed: true });
  assert.deepEqual(prAnswer(ok("not json")), { failed: true });
  assert.deepEqual(prAnswer(ok("{}")), { failed: true });
  assert.deepEqual(prAnswer(null), { failed: true });
});

test("headRefOid is carried as head", () => {
  const mk = (o) => ok(JSON.stringify({ number: 4, url: "u", state: "MERGED", headRefOid: "8706792", ...o }));
  assert.equal(parsePr(mk({})).head, "8706792");
  assert.equal(prAnswer(mk({})).pr.head, "8706792");
  assert.equal("head" in parsePr(mk({ headRefOid: undefined })), false);
});

test("prShown: merged only while HEAD is the merged commit", () => {
  const merged = { number: 4, url: "u", kind: "merged", head: "8706792" };
  assert.equal(prShown(merged, "8706792"), merged);
  assert.equal(prShown(merged, "5a64de9"), null);
  assert.equal(prShown(merged, null), null);
  assert.equal(prShown({ ...merged, head: undefined }, "8706792"), null);
  for (const kind of ["ok", "review", "failing"]) {
    const pr = { number: 1, url: "u", kind };
    assert.equal(prShown(pr, "x"), pr);
    assert.equal(prShown(pr, null), pr);
  }
  assert.equal(prShown(null, "x"), null);
});

test("prShown compares the merged head and HEAD without case", () => {
  const merged = { number: 4, url: "u", kind: "merged", head: "ABCDEF1" };
  assert.equal(prShown(merged, "abcdef1"), merged);
  assert.equal(prShown({ ...merged, head: "abcdef1" }, "ABCDEF1").number, 4);
});
