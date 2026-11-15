import { test } from "node:test";
import assert from "node:assert/strict";
import { ownBlock, fitWidth } from "../mods/usage/lib/layout.js";

const tree = { id: "root", type: "column", children: [
  { id: "main", type: "block", content: { terminal: "t1" } },
  { id: "status-row", type: "row", children: [
    { id: "status", type: "block", size: { weight: 1 }, content: { mod: "workspace-status" } },
    { id: "usage", type: "block", size: { px: 200 }, content: { mod: "usage-test" } }] }] };

test("ownBlock finds the block that shows the mod", () => {
  assert.equal(ownBlock(tree, "usage-test").id, "usage");
  assert.equal(ownBlock({ root: tree }, "usage-test").id, "usage");
  assert.equal(ownBlock(tree, "usage"), null);
  assert.equal(ownBlock(null, "usage"), null);
});

test("fitWidth is the button plus the block's side padding, or null when it already fits", () => {
  assert.equal(fitWidth({ id: "usage", size: { px: 200 } }, 240.4), 257);
  assert.equal(fitWidth({ id: "usage", size: { px: 257 } }, 240.4), null);
  assert.equal(fitWidth({ id: "usage", size: { weight: 1.2 } }, 240.4), 257);
  assert.equal(fitWidth({ id: "usage", size: { px: 200 } }, 0), null);
});
