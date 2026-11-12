import { test } from "node:test";
import assert from "node:assert/strict";
import { parseStatus, folderMarks, markOf } from "../mods/code-explorer/lib/status.js";

test("parseStatus marks new, modified, deleted and conflicted files by absolute path", () => {
  // Cursor's letters: U untracked, A added to the index, ! a merge conflict.
  const out = ["?? new.ts", " M src/a.ts", "D  gone.md", "UU x.ts", "AA both.ts", "DU y.ts", "A  added.ts", "AM staged.ts", ""].join("\0");
  assert.deepEqual(parseStatus(out, "/top"), {
    "/top/new.ts": "U",
    "/top/src/a.ts": "M",
    "/top/gone.md": "D",
    "/top/x.ts": "!",
    "/top/both.ts": "!",
    "/top/y.ts": "!",
    "/top/added.ts": "A",
    "/top/staged.ts": "A",
  });
});

test("parseStatus keeps paths with spaces and Korean characters", () => {
  assert.deepEqual(parseStatus(" M docs/회의 메모 \"v2\".md\0", "/top"), { "/top/docs/회의 메모 \"v2\".md": "M" });
});

test("parseStatus keys are NFC so NFD names from a folder listing still match", () => {
  const nfd = "회의.md".normalize("NFD");
  const marks = parseStatus(` M docs/${nfd}\0`, "/top");
  assert.equal(marks[`/top/docs/${"회의.md".normalize("NFC")}`], "M");
});

const changed = parseStatus(" M backend/app/engine.py\0?? sample/\0?? backend/new.py\0UU web/a.ts\0", "/r");

test("folderMarks marks every folder above a change, the strongest letter winning", () => {
  const folders = folderMarks(changed, "/r");
  assert.equal(folders.get("/r/backend"), "M");
  assert.equal(folders.get("/r/backend/app"), "M");
  assert.equal(folders.get("/r/web"), "!");
  assert.equal(folders.get("/r/sample"), "U");
  assert.equal(folders.has("/r"), false);
  assert.equal(folders.has("/r/docs"), false);
});

test("markOf finds a file's letter, a folder's, and files inside an untracked folder (U)", () => {
  const folders = folderMarks(changed, "/r");
  assert.equal(markOf(changed, folders, "/r/backend/app/engine.py", false), "M");
  assert.equal(markOf(changed, folders, "/r/backend", true), "M");
  assert.equal(markOf(changed, folders, "/r/sample/openapi/spec.yaml", false), "U");
  assert.equal(markOf(changed, folders, "/r/README.md", false), undefined);
});
