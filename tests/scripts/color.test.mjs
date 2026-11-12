import { test } from "node:test";
import assert from "node:assert/strict";
import { blend, flatten } from "../../scripts/lib/color.mjs";

test("blend mixes a colour over a background at an alpha", () => {
  assert.equal(blend("#de935f", "#1e2629", 0xbb / 255), "#ab7651");
  assert.equal(blend("#ffffff", "#000000", 0), "#000000");
});

test("flatten uses the colour's own alpha and expands short forms", () => {
  assert.equal(flatten("#4b729355", "#1a2024"), "#2a3b49");
  assert.equal(flatten("#fff", "#000000"), "#ffffff");
  assert.equal(flatten("#C5C8C6", "#000000"), "#c5c8c6");
});
