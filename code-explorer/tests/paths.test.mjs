import { test } from "node:test";
import assert from "node:assert/strict";
import { baseName, parentOf, extOf, relativeTo } from "../mods/code-explorer/lib/paths.js";

test("extOf is the lower-cased last extension, empty when there is none", () => {
  assert.equal(extOf("Dockerfile"), "");
  assert.equal(extOf("a.D.TS"), "ts");
  assert.equal(extOf(".gitignore"), "gitignore");
});

test("baseName and parentOf split a path", () => {
  assert.equal(baseName("/r/a b/회의.md"), "회의.md");
  assert.equal(parentOf("/r/a b/회의.md"), "/r/a b");
  assert.equal(parentOf("/top"), "/");
});

test("relativeTo keeps spaces and Korean names intact", () => {
  assert.equal(relativeTo("/r", "/r/a b/회의.md"), "a b/회의.md");
  assert.equal(relativeTo("/r", "/r"), "");
  assert.equal(relativeTo("/r", "/other/x"), null);
});

import { viewerKind } from "../mods/code-explorer/lib/paths.js";

test("viewerKind picks the view by extension", () => {
  assert.equal(viewerKind("a.SVG"), "image");
  assert.equal(viewerKind("x.mdx"), "markdown");
  assert.equal(viewerKind("index.HTML"), "html");
  assert.equal(viewerKind("Dockerfile"), "code");
  assert.equal(viewerKind("스크린샷 \"1\".png"), "image");
});
