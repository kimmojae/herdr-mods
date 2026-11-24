import { test } from "node:test";
import assert from "node:assert/strict";
import { parseStatus, gitMarks, gitLine, gitWords, STATUS_ARGS } from "../mods/spaces-tree/lib/gitstatus.js";

const ok = (stdout) => ({ code: 0, stdout, stderr: "" });
const H = "# branch.oid 1111111\n# branch.head main\n# branch.upstream origin/main\n";
const one = (xy, path) => `1 ${xy} N... 100644 100644 100644 aaa bbb ${path}`;
const two = (xy, path, from) => `2 ${xy} N... 100644 100644 100644 aaa bbb R100 ${path}\t${from}`;
const none = { ahead: 0, behind: 0, conflicted: 0, stashed: 0, deleted: 0, renamed: 0, modified: 0, staged: 0, untracked: 0 };

test("the status line's command with --show-stash and every untracked file, args separate", () => {
  assert.deepEqual(STATUS_ARGS, ["--no-optional-locks", "status", "--porcelain=v2", "--branch", "--show-stash", "--untracked-files=all"]);
});

test("parseStatus: branch.ab gives ahead and behind; # stash the stash count", () => {
  assert.deepEqual(parseStatus(ok(H + "# branch.ab +3 -2\n# stash 2\n")), { ...none, ahead: 3, behind: 2, stashed: 2 });
  assert.deepEqual(parseStatus(ok("# branch.oid x\n# branch.head main\n")), none);
});

test("parseStatus: staged, modified, both on one file", () => {
  const out = [one("M.", "a"), one("A.", "b"), one(".M", "c"), one("MM", "d"), one("T.", "e"), one(".T", "f")].join("\n");
  assert.deepEqual(parseStatus(ok(H + out + "\n")), { ...none, staged: 4, modified: 3 });
});

test("parseStatus: a staged delete is deleted, not staged; a worktree delete is deleted", () => {
  const out = [one("D.", "gone"), one(".D", "gone2"), one("AD", "added-then-deleted")].join("\n");
  assert.deepEqual(parseStatus(ok(out)), { ...none, deleted: 3, staged: 1 });
});

test("parseStatus: a rename is renamed only (not staged); edited after the rename also modified", () => {
  assert.deepEqual(parseStatus(ok([two("R.", "new", "old"), two("RM", "n2", "o2")].join("\n"))), { ...none, renamed: 2, modified: 1 });
});

test("parseStatus: conflicts, and untracked = the number of `? ` lines", () => {
  const out = ["u UU N... 100644 100644 100644 100644 a b c both", "? new.txt", "? dir/", "? x", "! ignored"].join("\n");
  assert.deepEqual(parseStatus(ok(out)), { ...none, conflicted: 1, untracked: 3 });
});

test("parseStatus: no answer is null (the host keeps the last state)", () => {
  assert.equal(parseStatus({ code: 128, stdout: "", stderr: "fatal" }), null);
  assert.equal(parseStatus(undefined), null);
});

test("gitLine: each symbol with its count in starship's order, then ⇡ and ⇣ (both when both)", () => {
  const all = { ahead: 1, behind: 3, conflicted: 1, stashed: 2, deleted: 2, renamed: 1, modified: 9, staged: 3, untracked: 3 };
  assert.equal(gitLine(all), "=1 $2 ✘2 »1 !9 +3 ?3 ⇡1 ⇣3");
  assert.deepEqual(gitMarks({ ...none, modified: 2, untracked: 1 }), ["!2", "?1"]);
  assert.equal(gitLine({ ...none, behind: 4 }), "⇣4");
  assert.equal(gitLine(none), "");
  assert.equal(gitLine(null), "");
});

test("gitWords: the counts in words, in the same order", () => {
  assert.equal(gitWords({ ...none, deleted: 2, modified: 9, untracked: 3, ahead: 1 }), "2 deleted · 9 modified · 3 untracked · 1 ahead");
  assert.equal(gitWords({ ...none, conflicted: 1, stashed: 2, renamed: 1, staged: 2, behind: 4 }), "1 conflicted · 2 stashed · 1 renamed · 2 staged · 4 behind");
  assert.equal(gitWords(null), "");
});
