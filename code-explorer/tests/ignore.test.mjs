import { test } from "node:test";
import assert from "node:assert/strict";
import { parseIgnored, isIgnored, isExcluded } from "../mods/code-explorer/lib/ignore.js";

const set = parseIgnored("node_modules/\0dist/\0.env\0docs/회의 메모.tmp\0");

test("a file inside an ignored folder is ignored", () => {
  assert.equal(isIgnored(set, "node_modules/react/index.js", false), true);
});

test("an ignored folder itself is ignored, given with or without the slash", () => {
  assert.equal(isIgnored(set, "dist", true), true);
  assert.equal(isIgnored(set, "node_modules", true), true);
});

test("an ignored file is ignored, a tracked one is not", () => {
  assert.equal(isIgnored(set, ".env", false), true);
  assert.equal(isIgnored(set, "src/app.ts", false), false);
  assert.equal(isIgnored(set, "docs/회의 메모.tmp", false), true);
});

test("a name that only starts like an ignored folder is not ignored", () => {
  assert.equal(isIgnored(set, "distribution/x.ts", false), false);
});

test("empty git output ignores nothing", () => {
  assert.equal(isIgnored(parseIgnored(""), "anything", false), false);
});

test("isIgnored matches whether the path or git's output is NFC or NFD", () => {
  const set = parseIgnored(`${"캐시".normalize("NFC")}/\0`);
  assert.equal(isIgnored(set, `${"캐시".normalize("NFD")}/a.txt`, false), true);
  assert.equal(isIgnored(parseIgnored(`${"캐시".normalize("NFD")}/\0`), "캐시/a.txt".normalize("NFC"), false), true);
});

test("Cursor's default files.exclude names are hidden, other dotfiles are not", () => {
  for (const name of [".git", ".svn", ".hg", "CVS", ".DS_Store", "Thumbs.db"]) assert.equal(isExcluded(name), true, name);
  for (const name of [".gitignore", ".env", ".github", "cvs.txt"]) assert.equal(isExcluded(name), false, name);
});
