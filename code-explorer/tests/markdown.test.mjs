import { test } from "node:test";
import assert from "node:assert/strict";
import { resolveLink, markdownBlocks } from "../mods/code-explorer/lib/markdown.js";

test("resolveLink resolves relative paths and ignores web links and anchors", () => {
  assert.equal(resolveLink("/r/docs", "../README.md"), "/r/README.md");
  assert.equal(resolveLink("/r/docs", "./a%20b.md#top"), "/r/docs/a b.md");
  assert.equal(resolveLink("/r/docs", "https://a.b"), null);
  assert.equal(resolveLink("/r/docs", "mailto:x@y.z"), null);
  assert.equal(resolveLink("/r/docs", "#top"), null);
});

test("markdownBlocks splits out a standalone local image line", () => {
  const blocks = markdownBlocks("# T\n\n![logo](./logo.png)\n\ntext", "/r");
  assert.deepEqual(blocks.map((b) => b.type), ["text", "image", "text"]);
  assert.equal(blocks[1].path, "/r/logo.png");
});

test("markdownBlocks keeps images inside code fences as text", () => {
  assert.deepEqual(markdownBlocks("```\n![x](a.png)\n```", "/r").map((b) => b.type), ["text"]);
});

test("leading YAML front matter becomes a yaml code block", () => {
  const blocks = markdownBlocks("---\nname: x\ncolors: 1\n---\n# Title\n", "/r");
  assert.equal(blocks[0].type, "text");
  assert.ok(blocks[0].text.startsWith("```yaml\nname: x\ncolors: 1\n```"));
  assert.ok(blocks[0].text.includes("# Title"));
});

test("resolveLink handles absolute paths, file URLs and folders with spaces or Korean", () => {
  assert.equal(resolveLink("/r/docs", "/etc/hosts"), "/etc/hosts");
  assert.equal(resolveLink("/r/docs", "file:///r/x.md"), "/r/x.md");
  assert.equal(resolveLink("/r/회의 #1", "img.png"), "/r/회의 #1/img.png");
  assert.equal(resolveLink("/r/docs", "../../../a.md"), "/a.md");
  assert.equal(resolveLink("/r/docs", ""), null);
});

test("markdownBlocks reads <bracketed> sources and titles, and leaves web images to the text", () => {
  const blocks = markdownBlocks('![a](<my pic.png> "Title")\n![b](https://x.y/z.png)', "/r");
  assert.deepEqual(blocks[0], { type: "image", alt: "a", path: "/r/my pic.png" });
  assert.equal(blocks[1].type, "text");
});

test("markdownBlocks closes a fence only with the same character and at least its length", () => {
  const text = "~~~~\n```\n![x](a.png)\n~~~\n![y](b.png)\n~~~~\n![z](c.png)";
  assert.deepEqual(markdownBlocks(text, "/r").map((b) => b.type), ["text", "image"]);
});
